-- Forward repair for installed 039/040 functions that still declare m as uuid.
-- Existing measurement IDs are bigint; never convert them into UUIDs.
begin;

-- Older installs may also retain a UUID column in the transient write guard.
-- Cast via text only for that legacy type; unexpected stored values fail and
-- roll back the migration instead of deleting any records.
do $repair$
begin
 if exists(select 1 from pg_attribute
  where attrelid='public.room_measurement_write_guards'::regclass
   and attname='measurement_id' and atttypid='uuid'::regtype and not attisdropped) then
  alter table public.room_measurement_write_guards
   alter column measurement_id type bigint using measurement_id::text::bigint;
 end if;
end $repair$;

create or replace function public.room_record_feeding(p_revision integer,p_payload jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m public.snake_measurements.id%type; happened timestamptz; planned timestamptz; due timestamptz; tz text; qty integer; low_g numeric; high_g numeric; status_text text; locked_item public.room_preparation_items;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','feeding','payload',p_payload)) then return public.room_snapshot(); end if;
 if coalesce(p_payload->>'result','') not in ('offered','fed','refused','skipped') then raise exception 'Invalid feeding result'; end if;
 if not exists(select 1 from public.room_assignments a join public.room_slots((select config from public.room_workspace where id=1)) s using(slot_id)
  join public.snakes n on n.id=a.snake_id
  where a.snake_id=p_payload->>'snake_id' and a.slot_id=p_payload->>'slot_id' and s.cabinet_id=p_payload->>'cabinet_id' and n.status='active') then
  select i.* into locked_item from public.room_preparation_items i join public.snakes n on n.id=i.snake_id
   where i.snake_id=p_payload->>'snake_id' and i.planned_at=(p_payload->>'planned_at')::timestamptz and n.status='active'
    and not exists(select 1 from public.room_assignments where snake_id=i.snake_id);
  if not found or (p_payload->>'slot_id' is not null and p_payload->>'slot_id'<>locked_item.slot_id)
   or (p_payload->>'cabinet_id' is not null and p_payload->>'cabinet_id'<>locked_item.cabinet_id)
  then raise exception 'Snake location changed or snake is inactive'; end if;
  p_payload:=p_payload||jsonb_build_object('slot_id',locked_item.slot_id,'cabinet_id',locked_item.cabinet_id);
 end if;
 happened:=(p_payload->>'occurred_at')::timestamptz;planned:=(p_payload->>'planned_at')::timestamptz;
 due:=coalesce((p_payload->>'due_at')::timestamptz,planned);
 if happened is null or planned is null or happened>now()+interval '5 minutes' then raise exception 'Invalid feeding time'; end if;
 qty:=(p_payload->>'quantity')::integer;low_g:=(p_payload->>'mouse_min_g')::numeric;high_g:=(p_payload->>'mouse_max_g')::numeric;
 if (p_payload->>'mouse_min_g' is not null and (p_payload->>'mouse_min_g')!~ '^\d+(\.\d+)?$') or (p_payload->>'mouse_max_g' is not null and (p_payload->>'mouse_max_g')!~ '^\d+(\.\d+)?$') then raise exception 'Invalid mouse weight'; end if;
 if qty is null or qty not between 0 and 100 or (low_g is null)<>(high_g is null) or low_g<=0 or high_g<low_g
 or p_payload->>'result' in ('fed','offered') and (qty=0 or low_g is null) then raise exception 'Invalid feeding amount'; end if;
 if length(coalesce(p_payload->>'notes',''))>2000 then raise exception 'Feeding note too long'; end if;
 select config->>'timezone' into tz from public.room_workspace where id=1;
 status_text:=case p_payload->>'result' when 'offered' then '已投喂，待确认进食' when 'fed' then '已进食' when 'refused' then '拒食' else '跳过' end||case when low_g is not null then ' · '||low_g||'–'||high_g||'g × '||qty else '' end;
 select measurement_id into m from public.room_feeding_records where snake_id=p_payload->>'snake_id' and planned_at=planned;
 if m is null then
  insert into public.snake_measurements(snake_id,record_kind,measured_at,feeding_status,condition_note)
  values(p_payload->>'snake_id','feeding',(happened at time zone tz)::date,status_text,coalesce(p_payload->>'notes','')) returning id into m;
 else
  insert into public.room_measurement_write_guards(transaction_id,backend_id,measurement_id) values(txid_current(),pg_backend_pid(),m);
  update public.snake_measurements set measured_at=(happened at time zone tz)::date,feeding_status=status_text,condition_note=coalesce(p_payload->>'notes','') where id=m;
  delete from public.room_measurement_write_guards where transaction_id=txid_current() and backend_id=pg_backend_pid() and measurement_id=m;
 end if;
 insert into public.room_feeding_records(request_id,snake_id,slot_id,cabinet_id,planned_at,due_at,result,mouse_min_g,mouse_max_g,quantity,occurred_at,measurement_id,notes,actor_id)
 values(p_request,p_payload->>'snake_id',p_payload->>'slot_id',p_payload->>'cabinet_id',planned,due,p_payload->>'result',low_g,high_g,qty,happened,m,coalesce(p_payload->>'notes',''),auth.uid())
 on conflict(snake_id,planned_at) do update set request_id=excluded.request_id,result=excluded.result,mouse_min_g=excluded.mouse_min_g,mouse_max_g=excluded.mouse_max_g,quantity=excluded.quantity,occurred_at=excluded.occurred_at,notes=excluded.notes,actor_id=excluded.actor_id;
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;

revoke all on function public.room_record_feeding(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.room_record_feeding(integer,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';

