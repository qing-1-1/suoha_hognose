-- Preserve actual records and locked batches; cap automatic recommendations for males.
begin;
create or replace function public.room_generate_plans(p_from date default null,p_to date default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb;tz text;start_day date;end_day date;day date;c jsonb;s jsonb;o jsonb;r jsonb;a record;
 original timestamptz;due timestamptz;clock_time text;weekday integer;weight numeric;low_g numeric;high_g numeric;qty integer;warnings jsonb;
 added integer:=0;changed integer:=0;removed integer:=0;affected integer;was_existing boolean;rev integer;counts jsonb;
begin
 -- Only service_role is granted EXECUTE. The private worker never impersonates an editor.
 select config,revision into cfg,rev from public.room_workspace where id=1 for update;
 if cfg is null then return jsonb_build_object('revision',rev,'generated',0,'updated',0,'removed',0,'reason','room_not_configured');end if;
 tz:=cfg->>'timezone';start_day:=coalesce(p_from,(now() at time zone tz)::date);end_day:=coalesce(p_to,start_day+35);
 if end_day<start_day or end_day-start_day>366 then raise exception 'Invalid plan generation range';end if;
 create temporary table if not exists room_generation_keys(snake_id text,planned_at timestamptz,primary key(snake_id,planned_at)) on commit drop;
 truncate pg_temp.room_generation_keys;
 for a in select ra.*,n.sex from public.room_assignments ra join public.snakes n on n.id=ra.snake_id where n.status='active' loop
  c:=public.room_slot_cabinet(cfg,a.slot_id);
  if c is null or c->>'type'='incubator' or coalesce((c->'schedule'->>'paused')::boolean,false) then continue;end if;
  s:=case when c->'slotSchedules' ? a.slot_id then c->'slotSchedules'->a.slot_id else c->'schedule' end;
  if s is null or s='null'::jsonb or coalesce((s->>'paused')::boolean,false) then continue;end if;
  select weight_g into weight from public.snake_measurements where snake_id=a.snake_id and weight_g>0 and weight_g::text ~ '^\d+(\.\d+)?$' and measured_at<=(now() at time zone tz)::date order by measured_at desc,id desc limit 1;
  low_g:=null;high_g:=null;
  if weight is not null then
   select item into r from jsonb_array_elements(cfg->'rules') item where weight>(item->>'min')::numeric and (item->>'max' is null or weight<=(item->>'max')::numeric) limit 1;
   low_g:=(r->>'mouseMin')::numeric;high_g:=(r->>'mouseMax')::numeric;
  end if;
  if a.sex='M' and (low_g>6 or high_g>8) then low_g:=6;high_g:=8;end if;
  qty:=(s->>'quantity')::integer;warnings:='[]';
  if weight is null then warnings:=warnings||'"待称重"'::jsonb;end if;
  if low_g is null then warnings:=warnings||'"鼠重待确认"'::jsonb;end if;
  if qty is null then warnings:=warnings||'"只数待确认"'::jsonb;end if;
  for day in select d::date from generate_series(start_day::timestamp,end_day::timestamp,interval '1 day') d
   union select ((item->>'plannedAt')::timestamptz at time zone tz)::date from jsonb_array_elements(coalesce(cfg->'taskOverrides','[]')) item
    where item->>'snakeId'=a.snake_id and item->>'overrideAt' is not null and ((item->>'overrideAt')::timestamptz at time zone tz)::date between start_day and end_day loop
   if day<(s->>'start')::date or s->>'end' is not null and day>(s->>'end')::date then continue;end if;
   weekday:=extract(isodow from day)::integer;
   if s->>'mode'='weekly' then
    if not (s->'weekdays' @> jsonb_build_array(weekday)) then continue;end if;
    clock_time:=coalesce(s->'times'->>weekday::text,s->>'time');
   else
    if (day-(s->>'start')::date)%(s->>'interval')::integer<>0 then continue;end if;
    clock_time:=s->>'time';
   end if;
   original:=public.room_local_instant(day,clock_time,tz);
   if original is null or original<a.assigned_at then continue;end if;
   select item into o from jsonb_array_elements(coalesce(cfg->'taskOverrides','[]')) item where item->>'snakeId'=a.snake_id and (item->>'plannedAt')::timestamptz=original;
   if coalesce((o->>'cancelled')::boolean,false) then continue;end if;
   due:=coalesce((o->>'overrideAt')::timestamptz,original);
   if (due at time zone tz)::date not between start_day and end_day then continue;end if;
   insert into pg_temp.room_generation_keys values(a.snake_id,original) on conflict do nothing;
   if exists(select 1 from public.room_feeding_records where snake_id=a.snake_id and planned_at=original) then continue;end if;
   was_existing:=exists(select 1 from public.room_plan_snapshots where snake_id=a.snake_id and planned_at=original);
   insert into public.room_plan_snapshots(snake_id,slot_id,cabinet_id,planned_at,due_at,mouse_min_g,mouse_max_g,quantity,warnings)
    values(a.snake_id,a.slot_id,c->>'id',original,due,low_g,high_g,qty,warnings)
    on conflict(snake_id,planned_at) do update set slot_id=excluded.slot_id,cabinet_id=excluded.cabinet_id,due_at=excluded.due_at,mouse_min_g=excluded.mouse_min_g,mouse_max_g=excluded.mouse_max_g,quantity=excluded.quantity,warnings=excluded.warnings,frozen_at=now()
    where room_plan_snapshots.due_at>=now() and room_plan_snapshots.batch_item_id is null and
     (room_plan_snapshots.slot_id,room_plan_snapshots.cabinet_id,room_plan_snapshots.due_at,room_plan_snapshots.mouse_min_g,room_plan_snapshots.mouse_max_g,room_plan_snapshots.quantity,room_plan_snapshots.warnings)
     is distinct from (excluded.slot_id,excluded.cabinet_id,excluded.due_at,excluded.mouse_min_g,excluded.mouse_max_g,excluded.quantity,excluded.warnings);
   get diagnostics affected=row_count;
   if was_existing then changed:=changed+affected;else added:=added+affected;end if;
  end loop;
 end loop;
 delete from public.room_plan_snapshots p where p.due_at>=now() and p.batch_item_id is null and (p.due_at at time zone tz)::date between start_day and end_day
  and not exists(select 1 from public.room_feeding_records where snake_id=p.snake_id and planned_at=p.planned_at)
  and not exists(select 1 from pg_temp.room_generation_keys k where k.snake_id=p.snake_id and k.planned_at=p.planned_at);
 get diagnostics removed=row_count;
 if added+changed+removed>0 then update public.room_workspace set revision=revision+1,updated_at=now() where id=1 returning revision into rev;end if;
 counts:=jsonb_build_object('revision',rev,'generated',added,'updated',changed,'removed',removed,'from',start_day,'to',end_day);
 insert into public.room_plan_generation_state values(1,now(),start_day,end_day,counts) on conflict(id) do update set last_run=excluded.last_run,range_from=excluded.range_from,range_to=excluded.range_to,counts=excluded.counts;
 return counts;
end $$;
revoke all on function public.room_generate_plans(date,date) from public,anon,authenticated;
grant execute on function public.room_generate_plans(date,date) to service_role;
-- Update unconfirmed recommendations already generated; preserve actual and locked records.
do $$ declare changed integer;begin
 update public.room_plan_snapshots p set mouse_min_g=6,mouse_max_g=8
 from public.snakes s where s.id=p.snake_id and s.sex='M' and p.batch_item_id is null
 and (p.mouse_min_g>6 or p.mouse_max_g>8)
 and not exists(select 1 from public.room_feeding_records f where f.snake_id=p.snake_id and f.planned_at=p.planned_at);
 get diagnostics changed=row_count;
 if changed>0 then update public.room_workspace set revision=revision+1,updated_at=now() where id=1;end if;
end $$;
commit;
notify pgrst,'reload schema';
