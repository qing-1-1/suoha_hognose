-- Incubation allocations, brumation boundaries, atomic intake and server-side planning.
begin;
create table public.room_incubation_allocations(
 slot_id text primary key,plan_id bigint not null references public.annual_breeding_plans(id),
 clutch_id bigint not null references public.clutches(id),egg_count integer not null check(egg_count between 1 and 10000),
 notes text not null default '' check(length(notes)<=2000),started_on date not null,expected_on date,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(expected_on is null or expected_on>=started_on)
);
create table public.room_incubation_history(
 id bigint generated always as identity primary key,action text not null,source_slot text,target_slot text,
 payload jsonb not null,actor_id uuid not null references auth.users(id),request_id uuid not null,occurred_at timestamptz not null default now()
);
alter table public.room_incubation_allocations enable row level security;
alter table public.room_incubation_history enable row level security;
revoke all on public.room_incubation_allocations,public.room_incubation_history from public,anon,authenticated;

create function public.room_slot_cabinet(p_config jsonb,p_slot text) returns jsonb
language sql immutable set search_path=public as $$
 select c from jsonb_array_elements(p_config->'cabinets') c where exists(
 select 1 from jsonb_array_elements(c->'levels') l,jsonb_array_elements(l->'slots') s where s->>'id'=p_slot) limit 1
$$;
revoke all on function public.room_slot_cabinet(jsonb,text) from public,anon,authenticated;

alter function public.room_validate_config(jsonb) rename to room_validate_config_v041;
create function public.room_validate_config(p jsonb) returns void
language plpgsql set search_path=public as $$
declare normalized jsonb; cabinets jsonb:='[]';c jsonb;old_config jsonb;old_c jsonb;new_c jsonb;occupied record;ls jsonb;l jsonb;first_box jsonb;
begin
 for c in select value from jsonb_array_elements(p->'cabinets') loop
  if c->>'type'='incubator' then
   if coalesce(c->>'purpose','') not in ('brumation','eggs') then raise exception '请选择冬化或孵蛋用途'; end if;
   if coalesce(c->'schedule','null')<>'null'::jsonb or coalesce(c->'slotSchedules','{}')<>'{}'::jsonb then raise exception '冬化和孵蛋箱不安排常规喂食'; end if;
   ls:='[]';first_box:=null;
   for l in select value from jsonb_array_elements(c->'levels') loop
    if first_box is null then first_box:=l;end if;
    if (l->>'boxWidth',l->>'boxDepth',l->>'boxHeight') is distinct from (first_box->>'boxWidth',first_box->>'boxDepth',first_box->>'boxHeight') then raise exception '同一孵化箱请使用统一尺寸的盒子'; end if;
    ls:=ls||jsonb_build_array(jsonb_set(l,'{height}',l->'boxHeight'));
   end loop;
   cabinets:=cabinets||jsonb_build_array(jsonb_set(jsonb_set(c,'{type}','"rack"'),'{levels}',ls));
  else cabinets:=cabinets||jsonb_build_array(c);end if;
 end loop;
 normalized:=jsonb_set(p,'{cabinets}',cabinets);perform public.room_validate_config_v041(normalized);
 select config into old_config from public.room_workspace where id=1;
 for occupied in select a.slot_id from public.room_assignments a union select a.slot_id from public.room_incubation_allocations a loop
  old_c:=public.room_slot_cabinet(old_config,occupied.slot_id);new_c:=public.room_slot_cabinet(p,occupied.slot_id);
  if new_c is null or coalesce(old_c->>'type','rack') is distinct from coalesce(new_c->>'type','rack') or old_c->>'purpose' is distinct from new_c->>'purpose'
   or (select box_id from public.room_slots(old_config) where slot_id=occupied.slot_id) is distinct from (select box_id from public.room_slots(p) where slot_id=occupied.slot_id)
  then raise exception '占用中的柜体和格位不能删除、替换盒子或更换用途，请先转移内容'; end if;
 end loop;
end $$;
revoke all on function public.room_validate_config(jsonb) from public,anon,authenticated;

create function public.room_check_snake_location() returns trigger
language plpgsql security definer set search_path=public as $$
declare c jsonb;
begin
 select public.room_slot_cabinet(config,new.slot_id) into c from public.room_workspace where id=1;
 if c is null or c->>'type'='incubator' and c->>'purpose'='eggs' or exists(select 1 from public.room_incubation_allocations where slot_id=new.slot_id) then raise exception '孵蛋格不能安排蛇只'; end if;
 if c->>'type'='incubator' and c->>'purpose'='brumation' and exists(
  select 1 from public.room_preparation_items i left join public.room_feeding_records f on f.snake_id=i.snake_id and f.planned_at=i.planned_at
  where i.snake_id=new.snake_id and (f.id is null or f.result='offered'))
 then raise exception '进入冬化前请先完成或跳过已确认备料任务，并确认已投喂结果'; end if;
 return new;
end $$;
revoke all on function public.room_check_snake_location() from public,anon,authenticated;
create trigger check_snake_incubator_location before insert or update on public.room_assignments for each row execute function public.room_check_snake_location();

alter function public.room_carry_schedule(jsonb,text,text,boolean) rename to room_carry_schedule_v041;
create function public.room_carry_schedule(p_config jsonb,p_source text,p_target text,p_swap boolean) returns jsonb
language plpgsql set search_path=public as $$
begin
 if public.room_slot_cabinet(p_config,p_source)->>'type'='incubator' or public.room_slot_cabinet(p_config,p_target)->>'type'='incubator' then raise exception '进出冬化箱请采用目标格计划，不能携带喂食计划'; end if;
 return public.room_carry_schedule_v041(p_config,p_source,p_target,p_swap);
end $$;
revoke all on function public.room_carry_schedule(jsonb,text,text,boolean) from public,anon,authenticated;

alter function public.room_move_box(integer,text,text,boolean,uuid,text) rename to room_move_box_v041;
create function public.room_move_box(p_revision integer,p_source_slot text,p_target_slot text,p_swap boolean,p_request uuid,p_schedule_mode text default 'inherit') returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 select config into cfg from public.room_workspace where id=1;
 if public.room_slot_cabinet(cfg,p_source_slot)->>'type'='incubator' or public.room_slot_cabinet(cfg,p_target_slot)->>'type'='incubator' then raise exception '孵化箱请使用移蛇或移动孵蛋分配，不能交换饲养柜盒子'; end if;
 return public.room_move_box_v041(p_revision,p_source_slot,p_target_slot,p_swap,p_request,p_schedule_mode);
end $$;
revoke all on function public.room_move_box_v041(integer,text,text,boolean,uuid,text),public.room_move_box(integer,text,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.room_move_box(integer,text,text,boolean,uuid,text) to authenticated;

create function public.room_block_incubator_feeding() returns trigger
language plpgsql security definer set search_path=public as $$
declare c jsonb;
begin
 select public.room_slot_cabinet(w.config,a.slot_id) into c from public.room_workspace w join public.room_assignments a on a.snake_id=new.snake_id where w.id=1;
 if c->>'type'='incubator' then raise exception '冬化期间不能生成或记录常规喂食，请先移回饲养柜'; end if;
 return new;
end $$;
revoke all on function public.room_block_incubator_feeding() from public,anon,authenticated;
create trigger block_incubator_feeding before insert or update on public.room_feeding_records for each row execute function public.room_block_incubator_feeding();
create trigger block_incubator_preparation before insert on public.room_preparation_items for each row execute function public.room_block_incubator_feeding();
create function public.room_block_incubator_plan() returns trigger
language plpgsql security definer set search_path=public as $$
declare c jsonb;
begin
 select public.room_slot_cabinet(w.config,a.slot_id) into c from public.room_workspace w join public.room_assignments a on a.snake_id=new.snake_id where w.id=1;
 if c->>'type'='incubator' then return null; end if;return new;
end $$;
revoke all on function public.room_block_incubator_plan() from public,anon,authenticated;
create trigger block_incubator_plan before insert or update on public.room_plan_snapshots for each row execute function public.room_block_incubator_plan();

create function public.room_assign_batch(p_revision integer,p_items jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','assign_batch','items',p_items)) then return public.room_snapshot(); end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 1000 then raise exception '每批请安排 1–1000 条蛇'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) i group by i->>'snake_id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_items) i group by i->>'slot_id' having count(*)>1) then raise exception '批量入住不能重复蛇只或目标格位'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  perform 1 from public.snakes where id=item->>'snake_id' and status='active' for update;
  if not found or exists(select 1 from public.room_assignments where snake_id=item->>'snake_id' or slot_id=item->>'slot_id') then raise exception '仅可将未入住的在养蛇只安排到空格'; end if;
  if not exists(select 1 from public.room_slots((select config from public.room_workspace where id=1)) where slot_id=item->>'slot_id') then raise exception '目标格位不存在'; end if;
  insert into public.room_assignments(slot_id,snake_id) values(item->>'slot_id',item->>'snake_id');
  insert into public.room_location_history(snake_id,from_slot,to_slot,actor_id,request_id) values(item->>'snake_id',null,item->>'slot_id',auth.uid(),p_request);
 end loop;
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;return public.room_snapshot();
end $$;

create function public.room_validate_incubation(p_slot text,p_plan bigint,p_clutch bigint,p_count integer,p_started date,p_expected date) returns void
language plpgsql set search_path=public as $$
declare c jsonb;plan public.annual_breeding_plans;clutch public.clutches;event public.breeding_events;used integer;tz text;
begin
 select public.room_slot_cabinet(config,p_slot),config->>'timezone' into c,tz from public.room_workspace where id=1;
 if c is null or c->>'type' is distinct from 'incubator' or c->>'purpose' is distinct from 'eggs' or exists(select 1 from public.room_assignments where slot_id=p_slot) then raise exception '请选择空的孵蛋格位'; end if;
 select * into plan from public.annual_breeding_plans where id=p_plan for update;
 if not found or plan.review_status is distinct from 'approved' or plan.status='cancelled' then raise exception '请选择已批准且未取消的繁育计划'; end if;
 if not exists(select 1 from public.snakes where id=plan.female_snake_id and sex='F') or not exists(select 1 from public.snakes where id=plan.male_snake_id and sex='M') then raise exception '批准计划必须关联已登记的母本和公本';end if;
 select * into clutch from public.clutches where id=p_clutch for update;
 if not found or clutch.status is distinct from 'incubating' then raise exception '请先在繁育流程中记录正在孵化的窝次'; end if;
 select * into event from public.breeding_events where id=clutch.breeding_event_id for update;
 if not found or event.plan_id is distinct from plan.id or event.female_snake_id is distinct from plan.female_snake_id or event.male_snake_id is distinct from plan.male_snake_id
 or clutch.female_snake_id is distinct from plan.female_snake_id or clutch.male_snake_id is distinct from plan.male_snake_id then raise exception '窝次、配种事件与批准计划的亲本不匹配'; end if;
 select coalesce(sum(egg_count),0) into used from public.room_incubation_allocations where clutch_id=p_clutch and slot_id<>p_slot;
 if p_count is null or p_count<1 or p_count>10000 or used+p_count>coalesce(clutch.fertile_egg_count,clutch.egg_count,0)-coalesce(clutch.hatched_count,0) then raise exception '分配数量超过窝次剩余可孵化蛋数'; end if;
 if p_started is null or p_started<clutch.laid_date or p_started>(now() at time zone tz)::date or p_expected<p_started then raise exception '请检查实际入箱日期和预计出壳日期'; end if;
end $$;
revoke all on function public.room_validate_incubation(text,bigint,bigint,integer,date,date) from public,anon,authenticated;

create function public.room_save_incubation(p_revision integer,p_payload jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','save_incubation','payload',p_payload)) then return public.room_snapshot(); end if;
 if length(coalesce(p_payload->>'notes',''))>2000 then raise exception '孵化备注最多 2000 字'; end if;
 if exists(select 1 from public.room_incubation_allocations where slot_id=p_payload->>'slot_id' and (plan_id,clutch_id) is distinct from ((p_payload->>'plan_id')::bigint,(p_payload->>'clutch_id')::bigint)) then raise exception '更换格位中的窝次前请先释放原分配';end if;
 perform public.room_validate_incubation(p_payload->>'slot_id',(p_payload->>'plan_id')::bigint,(p_payload->>'clutch_id')::bigint,(p_payload->>'egg_count')::integer,(p_payload->>'started_on')::date,(p_payload->>'expected_on')::date);
 insert into public.room_incubation_allocations(slot_id,plan_id,clutch_id,egg_count,notes,started_on,expected_on)
 values(p_payload->>'slot_id',(p_payload->>'plan_id')::bigint,(p_payload->>'clutch_id')::bigint,(p_payload->>'egg_count')::integer,coalesce(p_payload->>'notes',''),(p_payload->>'started_on')::date,(p_payload->>'expected_on')::date)
 on conflict(slot_id) do update set plan_id=excluded.plan_id,clutch_id=excluded.clutch_id,egg_count=excluded.egg_count,notes=excluded.notes,started_on=excluded.started_on,expected_on=excluded.expected_on,updated_at=now();
 insert into public.room_incubation_history(action,target_slot,payload,actor_id,request_id) values('save',p_payload->>'slot_id',p_payload,auth.uid(),p_request);
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;return public.room_snapshot();
end $$;

create function public.room_move_incubation(p_revision integer,p_source text,p_target text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare allocation public.room_incubation_allocations;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','move_incubation','source',p_source,'target',p_target)) then return public.room_snapshot(); end if;
 select * into allocation from public.room_incubation_allocations where slot_id=p_source;
 if not found or p_source=p_target or exists(select 1 from public.room_incubation_allocations where slot_id=p_target) then raise exception '请选择已有孵化分配和空的目标孵蛋格'; end if;
 delete from public.room_incubation_allocations where slot_id=p_source;
 perform public.room_validate_incubation(p_target,allocation.plan_id,allocation.clutch_id,allocation.egg_count,allocation.started_on,allocation.expected_on);
 insert into public.room_incubation_allocations(slot_id,plan_id,clutch_id,egg_count,notes,started_on,expected_on,created_at) values(p_target,allocation.plan_id,allocation.clutch_id,allocation.egg_count,allocation.notes,allocation.started_on,allocation.expected_on,allocation.created_at);
 insert into public.room_incubation_history(action,source_slot,target_slot,payload,actor_id,request_id) values('move',p_source,p_target,to_jsonb(allocation),auth.uid(),p_request);
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;return public.room_snapshot();
end $$;

create function public.room_clear_incubation(p_revision integer,p_slot text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare allocation public.room_incubation_allocations;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','clear_incubation','slot',p_slot)) then return public.room_snapshot(); end if;
 delete from public.room_incubation_allocations where slot_id=p_slot returning * into allocation;
 if not found then raise exception '格位没有孵化分配'; end if;
 insert into public.room_incubation_history(action,source_slot,payload,actor_id,request_id) values('release',p_slot,to_jsonb(allocation),auth.uid(),p_request);
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;return public.room_snapshot();
end $$;

create function public.room_protect_incubation_source() returns trigger
language plpgsql security definer set search_path=public as $$
declare allocated integer;
begin
 if tg_table_name='clutches' then
  select coalesce(sum(egg_count),0) into allocated from public.room_incubation_allocations where clutch_id=old.id;
  if allocated>0 and ((new.female_snake_id,new.male_snake_id,new.breeding_event_id) is distinct from (old.female_snake_id,old.male_snake_id,old.breeding_event_id)
   or new.status is distinct from 'incubating' or allocated>coalesce(new.fertile_egg_count,new.egg_count,0)-coalesce(new.hatched_count,0)) then raise exception '窝次已放入孵化箱，请先调整或释放分配再修改亲本、数量或出壳状态'; end if;
 elsif tg_table_name='annual_breeding_plans' then
  if exists(select 1 from public.room_incubation_allocations where plan_id=old.id) and ((new.female_snake_id,new.male_snake_id) is distinct from (old.female_snake_id,old.male_snake_id) or new.review_status is distinct from 'approved' or new.status='cancelled') then raise exception '计划已有孵蛋分配，请先释放后再修改亲本或审批状态'; end if;
 elsif exists(select 1 from public.room_incubation_allocations a join public.clutches c on c.id=a.clutch_id where c.breeding_event_id=old.id)
 and (new.plan_id,new.female_snake_id,new.male_snake_id) is distinct from (old.plan_id,old.female_snake_id,old.male_snake_id) then raise exception '配种事件已有孵蛋分配，不能更换计划或亲本'; end if;
 return new;
end $$;
revoke all on function public.room_protect_incubation_source() from public,anon,authenticated;
create trigger room_incubation_clutch_guard before update on public.clutches for each row execute function public.room_protect_incubation_source();
create trigger room_incubation_plan_guard before update on public.annual_breeding_plans for each row execute function public.room_protect_incubation_source();
create trigger room_incubation_event_guard before update on public.breeding_events for each row execute function public.room_protect_incubation_source();

alter function public.room_snapshot() rename to room_snapshot_v041;
create function public.room_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
declare base jsonb;
begin
 base:=public.room_snapshot_v041();
 return base||jsonb_build_object(
 'incubations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('female_snake_id',p.female_snake_id,'male_snake_id',p.male_snake_id,'clutch_code',c.clutch_code,'status',c.status) order by a.slot_id) from public.room_incubation_allocations a join public.annual_breeding_plans p on p.id=a.plan_id join public.clutches c on c.id=a.clutch_id),'[]'::jsonb),
 'breeding_plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.plan_year desc,p.id) from public.annual_breeding_plans p where p.review_status='approved' and p.status<>'cancelled'),'[]'::jsonb),
 'clutches',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('plan_id',e.plan_id,'remaining_eggs',greatest(0,coalesce(c.fertile_egg_count,c.egg_count,0)-coalesce(c.hatched_count,0)-coalesce((select sum(a.egg_count) from public.room_incubation_allocations a where a.clutch_id=c.id),0))) order by c.id desc)
 from public.clutches c join public.breeding_events e on e.id=c.breeding_event_id join public.annual_breeding_plans p on p.id=e.plan_id where p.review_status='approved' and p.status<>'cancelled' and (e.female_snake_id,e.male_snake_id,c.female_snake_id,c.male_snake_id)=(p.female_snake_id,p.male_snake_id,p.female_snake_id,p.male_snake_id)),'[]'::jsonb),
 'incubation_history',coalesce((select jsonb_agg(to_jsonb(h)-'actor_id' order by h.id desc) from public.room_incubation_history h),'[]'::jsonb));
end $$;
revoke all on function public.room_snapshot_v041(),public.room_snapshot() from public,anon,authenticated;
grant execute on function public.room_snapshot() to authenticated;
revoke all on function public.room_assign_batch(integer,jsonb,uuid),public.room_save_incubation(integer,jsonb,uuid),public.room_move_incubation(integer,text,text,uuid),public.room_clear_incubation(integer,text,uuid) from public,anon,authenticated;
grant execute on function public.room_assign_batch(integer,jsonb,uuid),public.room_save_incubation(integer,jsonb,uuid),public.room_move_incubation(integer,text,text,uuid),public.room_clear_incubation(integer,text,uuid) to authenticated;

create table public.room_plan_generation_state(id integer primary key check(id=1),last_run timestamptz not null,range_from date not null,range_to date not null,counts jsonb not null);
alter table public.room_plan_generation_state enable row level security;
revoke all on public.room_plan_generation_state from public,anon,authenticated;

-- Resolve DST gaps/folds identically to the browser: gaps omitted, first fold used.
create function public.room_local_instant(p_day date,p_time text,p_timezone text) returns timestamptz
language sql stable set search_path=public as $$
 with wall as(select (p_day::text||' '||p_time)::timestamp w),samples as(
  select w,(w at time zone 'UTC')+h*interval '1 hour' instant from wall,unnest(array[-36,-12,0,12,36]) h),
 offsets as(select distinct w,((instant at time zone p_timezone)-(instant at time zone 'UTC')) offset_value from samples),
 candidates as(select w,(w at time zone 'UTC')-offset_value candidate from offsets)
 select min(candidate) from candidates where candidate at time zone p_timezone=w
$$;
revoke all on function public.room_local_instant(date,text,text) from public,anon,authenticated;

create function public.room_generate_plans(p_from date default null,p_to date default null) returns jsonb
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
 for a in select ra.* from public.room_assignments ra join public.snakes n on n.id=ra.snake_id where n.status='active' loop
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
commit;
notify pgrst,'reload schema';
