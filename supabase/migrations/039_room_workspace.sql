-- Private, revisioned reptile-room workspace. No public table access; all writes are atomic RPCs.
begin;
create table public.room_workspace (
 id integer primary key check(id=1), revision integer not null default 0,
 config jsonb, updated_at timestamptz not null default now()
);
insert into public.room_workspace(id) values(1);
create table public.room_assignments (
 slot_id text primary key, snake_id text not null unique references public.snakes(id) on update cascade on delete restrict,
 assigned_at timestamptz not null default now()
);
create table public.room_location_history (
 id bigint generated always as identity primary key, snake_id text not null,
 from_slot text, to_slot text, actor_id uuid not null references auth.users(id),
 request_id uuid not null, occurred_at timestamptz not null default now()
);
create table public.room_feeding_records (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 snake_id text not null references public.snakes(id) on update cascade on delete restrict,
 slot_id text not null, cabinet_id text not null, planned_at timestamptz not null, due_at timestamptz not null,
 result text not null check(result in ('offered','fed','refused','skipped')),
 mouse_min_g numeric, mouse_max_g numeric, quantity integer not null check(quantity between 0 and 100),
 occurred_at timestamptz not null, measurement_id bigint references public.snake_measurements(id) on delete restrict,
 notes text not null default '', actor_id uuid not null references auth.users(id),
 unique(snake_id,planned_at),
 check(mouse_min_g>0 and mouse_max_g>=mouse_min_g or mouse_min_g is null and mouse_max_g is null),
 check(result not in ('fed','offered') or quantity>0 and mouse_min_g is not null)
);
create table public.room_requests (
 request_id uuid primary key, actor_id uuid not null references auth.users(id),
 payload jsonb not null, created_at timestamptz not null default now()
);
create table public.room_plan_snapshots (
 id uuid primary key default gen_random_uuid(), snake_id text not null references public.snakes(id) on update cascade on delete restrict,
 slot_id text not null,cabinet_id text not null,planned_at timestamptz not null,due_at timestamptz not null,
 mouse_min_g numeric,mouse_max_g numeric,quantity integer,warnings jsonb not null default '[]',frozen_at timestamptz not null default now(),
 unique(snake_id,planned_at),check(quantity is null or quantity between 1 and 100),
 check(mouse_min_g>0 and mouse_max_g>=mouse_min_g or mouse_min_g is null and mouse_max_g is null)
);
-- A transaction-scoped capability accessible only to the owner of the room RPC.
-- Unlike a session GUC, an authenticated client cannot manufacture this guard.
create table public.room_measurement_write_guards (
 transaction_id bigint not null,backend_id integer not null,measurement_id bigint not null,
 primary key(transaction_id,backend_id,measurement_id)
);
alter table public.room_workspace enable row level security;
alter table public.room_assignments enable row level security;
alter table public.room_location_history enable row level security;
alter table public.room_feeding_records enable row level security;
alter table public.room_requests enable row level security;
alter table public.room_plan_snapshots enable row level security;
alter table public.room_measurement_write_guards enable row level security;
revoke all on public.room_workspace,public.room_assignments,public.room_location_history,public.room_feeding_records,public.room_requests,public.room_plan_snapshots,public.room_measurement_write_guards from public,anon,authenticated;

create function public.room_protect_measurement() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.room_feeding_records where measurement_id=old.id)
 and not exists(select 1 from public.room_measurement_write_guards where transaction_id=txid_current() and backend_id=pg_backend_pid() and measurement_id=old.id)
 then raise exception '该喂食记录由爬房管理，请在爬房中修改'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.room_protect_measurement() from public,anon,authenticated;
create trigger room_managed_measurement_guard before update or delete on public.snake_measurements
 for each row execute function public.room_protect_measurement();

create function public.room_slots(p_config jsonb)
returns table(slot_id text,box_id text,cabinet_id text,box_width numeric,box_depth numeric,box_height numeric)
language sql immutable set search_path=public as $$
 select s->>'id',s->>'box_id',c->>'id',(l->>'boxWidth')::numeric,(l->>'boxDepth')::numeric,(l->>'boxHeight')::numeric
 from jsonb_array_elements(p_config->'cabinets') c,
 jsonb_array_elements(c->'levels') l,jsonb_array_elements(l->'slots') s
$$;

create function public.room_validate_schedule(p jsonb) returns void
language plpgsql set search_path=public as $$
declare d jsonb; t text;
begin
 if p is null or p='null'::jsonb then return; end if;
 if jsonb_typeof(p)<>'object' or coalesce(p->>'mode','') not in ('weekly','interval')
 or coalesce(p->>'start','')!~ '^\d{4}-\d{2}-\d{2}$'
 or coalesce(p->>'time','')!~ '^([01]\d|2[0-3]):[0-5]\d$'
 then raise exception 'Invalid feeding schedule'; end if;
 perform (p->>'start')::date;
 if p->>'end' is not null and (p->>'end')::date<(p->>'start')::date then raise exception 'Invalid schedule end'; end if;
 if p->>'paused' is not null and jsonb_typeof(p->'paused')<>'boolean' then raise exception 'Invalid paused flag'; end if;
 if p->>'quantity' is not null and (coalesce(p->>'quantity','')!~ '^\d+$' or (p->>'quantity')::integer not between 1 and 100) then raise exception 'Invalid feeding quantity'; end if;
 if p->>'mode'='interval' and (coalesce(p->>'interval','')!~ '^\d+$' or (p->>'interval')::integer not between 1 and 366) then raise exception 'Invalid feeding interval'; end if;
 if p->>'mode'='weekly' then
  if jsonb_typeof(p->'weekdays') is distinct from 'array' or jsonb_array_length(p->'weekdays') not between 1 and 7 then raise exception 'Invalid weekdays'; end if;
  for d in select value from jsonb_array_elements(p->'weekdays') loop
   if d::text !~ '^[1-7]$' then raise exception 'Invalid weekday'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p->'weekdays') item group by item having count(*)>1) then raise exception 'Duplicate weekday'; end if;
 end if;
 if p ? 'times' then
  if jsonb_typeof(p->'times')<>'object' then raise exception 'Invalid schedule times'; end if;
  for t,d in select key,value from jsonb_each(p->'times') loop
   if t!~ '^[1-7]$' or (d#>>'{}')!~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Invalid weekday time'; end if;
  end loop;
 end if;
end $$;

create function public.room_validate_config(p jsonb) returns void
language plpgsql set search_path=public as $$
declare c jsonb; l jsonb; r jsonb; s jsonb; k text; v numeric; rw numeric; rd numeric; rh numeric;
 cw numeric; cd numeric; ch numeric; ew numeric; ed numeric; x numeric; z numeric; total numeric;
 ids text[]:='{}'; level_ids text[]:='{}'; rule_ids text[]:='{}'; last_max numeric:=0; n integer:=0;
begin
 if p is null or jsonb_typeof(p)<>'object' or p->>'version' is distinct from '1' or length(coalesce(p->>'name','')) not between 1 and 120 then raise exception 'Invalid room config'; end if;
 if octet_length(p::text)>2000000 then raise exception 'Room config too large'; end if;
 foreach k in array array['width','depth','height'] loop
  if coalesce(p->>k,'')!~ '^\d+(\.\d+)?$' or (p->>k)::numeric not between 100 and 100000 then raise exception 'Invalid room dimension'; end if;
 end loop;
 rw:=(p->>'width')::numeric;rd:=(p->>'depth')::numeric;rh:=(p->>'height')::numeric;
 if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then raise exception 'Invalid room timezone'; end if;
 if jsonb_typeof(p->'cabinets') is distinct from 'array' or jsonb_array_length(p->'cabinets')>100 then raise exception 'Invalid cabinets'; end if;
 if jsonb_typeof(p->'rules') is distinct from 'array' or jsonb_array_length(p->'rules') not between 1 and 100 then raise exception 'Invalid mouse rules'; end if;
 for r in select value from jsonb_array_elements(p->'rules') loop
  n:=n+1;
  if coalesce(r->>'id','')='' or r->>'id'=any(rule_ids) then raise exception 'Duplicate or missing rule ID'; end if;
  rule_ids:=array_append(rule_ids,r->>'id');
  foreach k in array array['min','mouseMin','mouseMax'] loop
   if coalesce(r->>k,'')!~ '^\d+(\.\d+)?$' then raise exception 'Invalid mouse rule weight'; end if;
  end loop;
  if r->>'max' is not null and (r->>'max')!~ '^\d+(\.\d+)?$' then raise exception 'Invalid mouse rule maximum'; end if;
  if (r->>'min')::numeric is distinct from last_max or (r->>'mouseMin')::numeric<=0 or (r->>'mouseMax')::numeric<(r->>'mouseMin')::numeric
   or r->>'min' is null or r->>'mouseMin' is null or r->>'mouseMax' is null
   or (r->>'max' is null and n<>jsonb_array_length(p->'rules')) or (r->>'max')::numeric<=last_max
  then raise exception 'Mouse rules must be contiguous, positive and ordered'; end if;
  last_max:=(r->>'max')::numeric;
 end loop;
 if last_max is not null then raise exception 'Mouse rules require an open final band'; end if;
 if p ? 'taskOverrides' then
  if jsonb_typeof(p->'taskOverrides')<>'array' or jsonb_array_length(p->'taskOverrides')>10000 then raise exception 'Invalid task overrides'; end if;
  for r in select value from jsonb_array_elements(p->'taskOverrides') loop
   if not exists(select 1 from public.snakes where id=r->>'snakeId') or coalesce(r->>'plannedAt','')!~ '^\d{4}-\d{2}-\d{2}T'
   or jsonb_typeof(r->'cancelled') is distinct from 'boolean' then raise exception 'Invalid task override'; end if;
   perform (r->>'plannedAt')::timestamptz;
   if r->>'overrideAt' is not null then
    if (r->>'overrideAt')!~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'Invalid override time'; end if;
    perform (r->>'overrideAt')::timestamptz;
   end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p->'taskOverrides') item group by item->>'snakeId',(item->>'plannedAt')::timestamptz having count(*)>1) then raise exception 'Duplicate task override'; end if;
 end if;
 if jsonb_typeof(p->'labels') is distinct from 'array' then raise exception 'Invalid labels'; end if;
 for r in select value from jsonb_array_elements(p->'labels') loop
  if jsonb_typeof(r)<>'string' or r#>>'{}' not in ('id','sex','gene','weight','mouse','next') then raise exception 'Invalid label'; end if;
 end loop;
 for c in select value from jsonb_array_elements(p->'cabinets') loop
  if coalesce(c->>'type','rack') not in ('rack','silver') then raise exception 'Incubators are phase two'; end if;
  if coalesce(c->>'id','')='' or length(c->>'id')>100 or c->>'id'=any(ids) or length(coalesce(c->>'name','')) not between 1 and 120 then raise exception 'Invalid cabinet identity'; end if;
  ids:=array_append(ids,c->>'id');
  foreach k in array array['width','depth','height'] loop
   if coalesce(c->>k,'')!~ '^\d+(\.\d+)?$' or (c->>k)::numeric not between 1 and 100000 then raise exception 'Invalid cabinet dimension'; end if;
  end loop;
  cw:=(c->>'width')::numeric;cd:=(c->>'depth')::numeric;ch:=(c->>'height')::numeric;
  if coalesce(c->>'rotation','') not in ('0','90','180','270') then raise exception 'Cabinet rotation must face a wall'; end if;
  ew:=case when c->>'rotation' in ('90','270') then cd else cw end;
  ed:=case when c->>'rotation' in ('90','270') then cw else cd end;
  if coalesce(c->>'x','')!~ '^\d+(\.\d+)?$' or coalesce(c->>'z','')!~ '^\d+(\.\d+)?$' then raise exception 'Invalid cabinet coordinates'; end if;
  x:=(c->>'x')::numeric;z:=(c->>'z')::numeric;
  if x is null or z is null or x-ew/2<0 or z-ed/2<0 or x+ew/2>rw or z+ed/2>rd or ch>rh then raise exception 'Cabinet outside room'; end if;
  if jsonb_typeof(c->'levels') is distinct from 'array' or jsonb_array_length(c->'levels') not between 1 and 50 then raise exception 'Invalid levels'; end if;
  total:=0;
  for l in select value from jsonb_array_elements(c->'levels') loop
   if coalesce(l->>'id','')='' or l->>'id'=any(level_ids) then raise exception 'Invalid level identity'; end if;
   level_ids:=array_append(level_ids,l->>'id');
   foreach k in array array['height','boxWidth','boxDepth','boxHeight','count'] loop
    if coalesce(l->>k,'')!~ '^\d+(\.\d+)?$' or (l->>k)::numeric<=0 then raise exception 'Invalid level dimension'; end if;
   end loop;
   if (l->>'count')::numeric<>trunc((l->>'count')::numeric) or (l->>'count')::numeric>100 then raise exception 'Invalid slot count'; end if;
   if jsonb_typeof(l->'slots') is distinct from 'array' or jsonb_array_length(l->'slots')<>(l->>'count')::integer then raise exception 'Slot count mismatch'; end if;
   if (l->>'boxWidth')::numeric*(l->>'count')::integer>cw or (l->>'boxDepth')::numeric>cd or (l->>'boxHeight')::numeric>(l->>'height')::numeric then raise exception 'Boxes do not fit cabinet'; end if;
   total:=total+(l->>'height')::numeric;
  end loop;
  if total>ch then raise exception 'Levels exceed cabinet height'; end if;
  perform public.room_validate_schedule(c->'schedule');
  if c->>'ruleSetId' is not null then raise exception 'Only room mouse rules supported in phase one'; end if;
  if c ? 'slotSchedules' then
   if jsonb_typeof(c->'slotSchedules')<>'object' then raise exception 'Invalid slot schedules'; end if;
   for k,s in select key,value from jsonb_each(c->'slotSchedules') loop
    if not exists(select 1 from public.room_slots(p) where slot_id=k and cabinet_id=c->>'id') then raise exception 'Schedule references unknown slot'; end if;
    perform public.room_validate_schedule(s);
   end loop;
  end if;
 end loop;
 if exists(select 1 from public.room_slots(p) where coalesce(slot_id,'')='' or coalesce(box_id,'')='' or length(slot_id)>100 or length(box_id)>100)
 or exists(select 1 from public.room_slots(p) group by slot_id having count(*)>1)
 or exists(select 1 from public.room_slots(p) group by box_id having count(*)>1) then raise exception 'Duplicate or invalid slot/box identity'; end if;
 if exists(
  with boxes as(select item->>'id' id,(item->>'x')::numeric x,(item->>'z')::numeric z,
    (item->>case when item->>'rotation' in ('90','270') then 'depth' else 'width' end)::numeric w,
    (item->>case when item->>'rotation' in ('90','270') then 'width' else 'depth' end)::numeric d
   from jsonb_array_elements(p->'cabinets') item)
  select 1 from boxes a join boxes b on a.id<b.id where abs(a.x-b.x)<(a.w+b.w)/2 and abs(a.z-b.z)<(a.d+b.d)/2
 ) then raise exception 'Cabinets overlap'; end if;
end $$;

create function public.room_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 select jsonb_build_object('revision',revision,'config',config,
 'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by slot_id) from public.room_assignments a),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(to_jsonb(f)-'actor_id' order by occurred_at,id) from public.room_feeding_records f),'[]'::jsonb),
 'moves',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'snake_id',h.snake_id,'source_slot',h.from_slot,'target_slot',h.to_slot,'occurred_at',h.occurred_at,'request_id',h.request_id) order by h.id desc) from public.room_location_history h),'[]'::jsonb),
 'planned_tasks',coalesce((select jsonb_agg(to_jsonb(t) order by due_at,id) from public.room_plan_snapshots t),'[]'::jsonb)) into result
 from public.room_workspace where id=1;
 return result;
end $$;

-- Serialized row lock provides one optimistic revision boundary for every mutation.
create function public.room_begin_write(p_revision integer,p_request uuid,p_payload jsonb) returns boolean
language plpgsql set search_path=public as $$
declare prior public.room_requests; rev integer;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if p_request is null then raise exception 'Request ID required'; end if;
 select revision into rev from public.room_workspace where id=1 for update;
 select * into prior from public.room_requests where request_id=p_request;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>p_payload then raise exception 'Request conflict'; end if;
  return false;
 end if;
 if p_revision is distinct from rev then raise exception 'Room revision conflict: reload before saving'; end if;
 insert into public.room_requests(request_id,actor_id,payload) values(p_request,auth.uid(),p_payload);
 return true;
end $$;

create function public.room_save_layout(p_revision integer,p_config jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','layout','config',p_config)) then return public.room_snapshot(); end if;
 perform public.room_validate_config(p_config);
 if exists(select 1 from public.room_assignments a
  join public.room_slots((select config from public.room_workspace where id=1)) old on old.slot_id=a.slot_id
  left join public.room_slots(p_config) new on new.slot_id=a.slot_id
  where new.slot_id is null or new.box_id<>old.box_id)
 then raise exception 'Occupied slots and boxes cannot be removed or replaced'; end if;
 update public.room_workspace set config=p_config,revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;

create function public.room_carry_schedule(p_config jsonb,p_source text,p_target text,p_swap boolean) returns jsonb
language plpgsql set search_path=public as $$
declare source_schedule jsonb; target_schedule jsonb; source_cabinet text; target_cabinet text; c jsonb; cs jsonb:='[]'; overrides jsonb;
begin
 select cabinet_id into source_cabinet from public.room_slots(p_config) where slot_id=p_source;
 select cabinet_id into target_cabinet from public.room_slots(p_config) where slot_id=p_target;
 if source_cabinet is null or target_cabinet is null then raise exception 'Carrying schedule requires two existing slots'; end if;
 select case when item->'slotSchedules' ? p_source then item->'slotSchedules'->p_source else item->'schedule' end into source_schedule from jsonb_array_elements(p_config->'cabinets') item where item->>'id'=source_cabinet;
 select case when item->'slotSchedules' ? p_target then item->'slotSchedules'->p_target else item->'schedule' end into target_schedule from jsonb_array_elements(p_config->'cabinets') item where item->>'id'=target_cabinet;
 for c in select value from jsonb_array_elements(p_config->'cabinets') loop
  overrides:=coalesce(c->'slotSchedules','{}');
  if c->>'id'=target_cabinet then overrides:=overrides||jsonb_build_object(p_target,coalesce(source_schedule,'null')); end if;
  if p_swap and c->>'id'=source_cabinet then overrides:=overrides||jsonb_build_object(p_source,coalesce(target_schedule,'null')); end if;
  cs:=cs||jsonb_build_array(jsonb_set(c,'{slotSchedules}',overrides));
 end loop;
 return jsonb_set(p_config,'{cabinets}',cs);
end $$;

create function public.room_assign(p_revision integer,p_snake text,p_target_slot text,p_swap boolean,p_request uuid,p_schedule_mode text default 'inherit') returns jsonb
language plpgsql security definer set search_path=public as $$
declare source_slot text; other_snake text;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','assign','snake',p_snake,'target',p_target_slot,'swap',p_swap,'schedule_mode',p_schedule_mode)) then return public.room_snapshot(); end if;
 if p_schedule_mode is null or p_schedule_mode not in ('inherit','carry') then raise exception 'Invalid schedule transfer mode'; end if;
 perform 1 from public.snakes where id=p_snake and (status='active' or p_target_slot is null) for update;
 if not found then raise exception 'Only active snakes can be assigned'; end if;
 if p_target_slot is not null and not exists(select 1 from public.room_slots((select config from public.room_workspace where id=1)) where slot_id=p_target_slot) then raise exception 'Unknown target slot'; end if;
 select slot_id into source_slot from public.room_assignments where snake_id=p_snake;
 select snake_id into other_snake from public.room_assignments where slot_id=p_target_slot;
 if source_slot is null and p_target_slot is null then return public.room_snapshot(); end if;
 if other_snake=p_snake then return public.room_snapshot(); end if;
 if other_snake is not null and (not coalesce(p_swap,false) or source_slot is null) then raise exception 'Target occupied: choose swap from an occupied source'; end if;
 if other_snake is not null and not exists(select 1 from public.snakes where id=other_snake and status='active') then raise exception 'Target snake is not active'; end if;
 if p_schedule_mode='carry' then
  update public.room_workspace set config=public.room_carry_schedule(config,source_slot,p_target_slot,other_snake is not null) where id=1;
 end if;
 delete from public.room_assignments where snake_id=p_snake or snake_id=other_snake;
 if p_target_slot is not null then insert into public.room_assignments(slot_id,snake_id) values(p_target_slot,p_snake); end if;
 insert into public.room_location_history(snake_id,from_slot,to_slot,actor_id,request_id) values(p_snake,source_slot,p_target_slot,auth.uid(),p_request);
 if other_snake is not null then
  insert into public.room_assignments(slot_id,snake_id) values(source_slot,other_snake);
  insert into public.room_location_history(snake_id,from_slot,to_slot,actor_id,request_id) values(other_snake,p_target_slot,source_slot,auth.uid(),p_request);
 end if;
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;

create function public.room_record_feeding(p_revision integer,p_payload jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m public.snake_measurements.id%type; happened timestamptz; planned timestamptz; due timestamptz; tz text; qty integer; low_g numeric; high_g numeric; status_text text;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','feeding','payload',p_payload)) then return public.room_snapshot(); end if;
 if coalesce(p_payload->>'result','') not in ('offered','fed','refused','skipped') then raise exception 'Invalid feeding result'; end if;
 if not exists(select 1 from public.room_assignments a join public.room_slots((select config from public.room_workspace where id=1)) s using(slot_id)
  join public.snakes n on n.id=a.snake_id
  where a.snake_id=p_payload->>'snake_id' and a.slot_id=p_payload->>'slot_id' and s.cabinet_id=p_payload->>'cabinet_id' and n.status='active')
 then raise exception 'Snake location changed or snake is inactive'; end if;
 happened:=(p_payload->>'occurred_at')::timestamptz; planned:=(p_payload->>'planned_at')::timestamptz;
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

-- Both locations always contain a physical box. A move exchanges the boxes; an occupied
-- destination requires explicit swap. Box dimensions must match the destination slot.
create function public.room_move_box(p_revision integer,p_source_slot text,p_target_slot text,p_swap boolean,p_request uuid,p_schedule_mode text default 'inherit') returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb; source_box record; target_box record; source_snake text; target_snake text; cs jsonb:='[]'; ls jsonb; ss jsonb; c jsonb; l jsonb; s jsonb;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','move_box','source',p_source_slot,'target',p_target_slot,'swap',p_swap,'schedule_mode',p_schedule_mode)) then return public.room_snapshot(); end if;
 if p_schedule_mode is null or p_schedule_mode not in ('inherit','carry') then raise exception 'Invalid schedule transfer mode'; end if;
 select config into cfg from public.room_workspace where id=1;
 select * into source_box from public.room_slots(cfg) where slot_id=p_source_slot;
 select * into target_box from public.room_slots(cfg) where slot_id=p_target_slot;
 if source_box.slot_id is null or target_box.slot_id is null or p_source_slot=p_target_slot then raise exception 'Invalid box move'; end if;
 if source_box.box_width<>target_box.box_width or source_box.box_depth<>target_box.box_depth or source_box.box_height<>target_box.box_height then raise exception 'Box dimensions must match both slots'; end if;
 select snake_id into source_snake from public.room_assignments where slot_id=p_source_slot;
 select snake_id into target_snake from public.room_assignments where slot_id=p_target_slot;
 if target_snake is not null and not coalesce(p_swap,false) then raise exception 'Target occupied: confirm box swap'; end if;
 for c in select value from jsonb_array_elements(cfg->'cabinets') loop
  ls:='[]';
  for l in select value from jsonb_array_elements(c->'levels') loop
   ss:='[]';
   for s in select value from jsonb_array_elements(l->'slots') loop
    if s->>'id'=p_source_slot then s:=jsonb_set(s,'{box_id}',to_jsonb(target_box.box_id));
    elsif s->>'id'=p_target_slot then s:=jsonb_set(s,'{box_id}',to_jsonb(source_box.box_id)); end if;
    ss:=ss||jsonb_build_array(s);
   end loop;
   ls:=ls||jsonb_build_array(jsonb_set(l,'{slots}',ss));
  end loop;
  cs:=cs||jsonb_build_array(jsonb_set(c,'{levels}',ls));
 end loop;
 cfg:=jsonb_set(cfg,'{cabinets}',cs);
 if p_schedule_mode='carry' then cfg:=public.room_carry_schedule(cfg,p_source_slot,p_target_slot,coalesce(p_swap,false)); end if;
 delete from public.room_assignments where slot_id in (p_source_slot,p_target_slot);
 if source_snake is not null then
  insert into public.room_assignments(slot_id,snake_id) values(p_target_slot,source_snake);
  insert into public.room_location_history(snake_id,from_slot,to_slot,actor_id,request_id) values(source_snake,p_source_slot,p_target_slot,auth.uid(),p_request);
 end if;
 if target_snake is not null then
  insert into public.room_assignments(slot_id,snake_id) values(p_source_slot,target_snake);
  insert into public.room_location_history(snake_id,from_slot,to_slot,actor_id,request_id) values(target_snake,p_target_slot,p_source_slot,auth.uid(),p_request);
 end if;
 update public.room_workspace set config=cfg,revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;

-- Save plan projections before editing schedules. Once due, a pending projection is
-- retained as history; only future unrecorded projections can be replaced or removed.
create function public.room_sync_plans(p_revision integer,p_tasks jsonb,p_from date,p_to date,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t jsonb; tz text; cfg jsonb; original timestamptz; due timestamptz; low_g numeric; high_g numeric; qty integer; assigned timestamptz; changed integer:=0; affected integer; existing boolean;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','sync_plans','tasks',p_tasks,'from',p_from,'to',p_to)) then return public.room_snapshot(); end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks)>10000 then raise exception 'Invalid plan sync range'; end if;
 select config into cfg from public.room_workspace where id=1;tz:=coalesce(cfg->>'timezone','Asia/Shanghai');
 if exists(select 1 from jsonb_array_elements(p_tasks) item group by item->>'snake_id',(item->>'planned_at')::timestamptz having count(*)>1) then raise exception 'Duplicate planned occurrence'; end if;
 for t in select value from jsonb_array_elements(p_tasks) loop
  if coalesce(t->>'planned_at','')!~ '^\d{4}-\d{2}-\d{2}T' or coalesce(t->>'due_at',t->>'planned_at','')!~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'Invalid plan time'; end if;
  original:=(t->>'planned_at')::timestamptz;due:=coalesce((t->>'due_at')::timestamptz,original);
  if (due at time zone tz)::date not between p_from and p_to then raise exception 'Plan outside sync range'; end if;
  select a.assigned_at into assigned from public.room_assignments a join public.snakes n on n.id=a.snake_id join public.room_slots(cfg) s using(slot_id)
   where a.snake_id=t->>'snake_id' and a.slot_id=t->>'slot_id' and s.cabinet_id=t->>'cabinet_id' and n.status='active';
  if not found then raise exception 'Plan assignment changed'; end if;
  existing:=exists(select 1 from public.room_plan_snapshots where snake_id=t->>'snake_id' and planned_at=original);
  if original<assigned and not existing and not exists(select 1 from public.room_feeding_records where snake_id=t->>'snake_id' and planned_at=original) then raise exception 'Plan predates assignment'; end if;
  if (t->>'mouse_min_g' is not null and (t->>'mouse_min_g')!~ '^\d+(\.\d+)?$') or (t->>'mouse_max_g' is not null and (t->>'mouse_max_g')!~ '^\d+(\.\d+)?$') then raise exception 'Invalid planned mouse weight'; end if;
  low_g:=(t->>'mouse_min_g')::numeric;high_g:=(t->>'mouse_max_g')::numeric;qty:=(t->>'quantity')::integer;
  if (low_g is null)<>(high_g is null) or low_g<=0 or high_g<low_g or qty is not null and qty not between 1 and 100 then raise exception 'Invalid planned amount'; end if;
  if t ? 'warnings' and (jsonb_typeof(t->'warnings')<>'array' or octet_length((t->'warnings')::text)>4000) then raise exception 'Invalid plan warnings'; end if;
  if exists(select 1 from public.room_feeding_records where snake_id=t->>'snake_id' and planned_at=original) then continue; end if;
  insert into public.room_plan_snapshots(snake_id,slot_id,cabinet_id,planned_at,due_at,mouse_min_g,mouse_max_g,quantity,warnings)
   values(t->>'snake_id',t->>'slot_id',t->>'cabinet_id',original,due,low_g,high_g,qty,coalesce(t->'warnings','[]'))
   on conflict(snake_id,planned_at) do update set slot_id=excluded.slot_id,cabinet_id=excluded.cabinet_id,due_at=excluded.due_at,mouse_min_g=excluded.mouse_min_g,mouse_max_g=excluded.mouse_max_g,quantity=excluded.quantity,warnings=excluded.warnings,frozen_at=now()
   where room_plan_snapshots.due_at>=now() and
    (room_plan_snapshots.slot_id,room_plan_snapshots.cabinet_id,room_plan_snapshots.due_at,room_plan_snapshots.mouse_min_g,room_plan_snapshots.mouse_max_g,room_plan_snapshots.quantity,room_plan_snapshots.warnings)
    is distinct from (excluded.slot_id,excluded.cabinet_id,excluded.due_at,excluded.mouse_min_g,excluded.mouse_max_g,excluded.quantity,excluded.warnings);
  get diagnostics affected=row_count;changed:=changed+affected;
 end loop;
 delete from public.room_plan_snapshots stored where stored.due_at>=now() and (stored.due_at at time zone tz)::date between p_from and p_to
  and not exists(select 1 from public.room_feeding_records where snake_id=stored.snake_id and planned_at=stored.planned_at)
  and not exists(select 1 from jsonb_array_elements(p_tasks) item where item->>'snake_id'=stored.snake_id and (item->>'planned_at')::timestamptz=stored.planned_at);
 get diagnostics affected=row_count;changed:=changed+affected;
 if changed>0 then update public.room_workspace set revision=revision+1,updated_at=now() where id=1; end if;
 return public.room_snapshot();
end $$;

revoke all on function public.room_sync_plans(integer,jsonb,date,date,uuid) from public,anon,authenticated;
grant execute on function public.room_sync_plans(integer,jsonb,date,date,uuid) to authenticated;
revoke all on function public.room_slots(jsonb),public.room_validate_schedule(jsonb),public.room_validate_config(jsonb),public.room_carry_schedule(jsonb,text,text,boolean),public.room_begin_write(integer,uuid,jsonb),public.room_snapshot(),public.room_save_layout(integer,jsonb,uuid),public.room_assign(integer,text,text,boolean,uuid,text),public.room_record_feeding(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.room_snapshot(),public.room_save_layout(integer,jsonb,uuid),public.room_assign(integer,text,text,boolean,uuid,text),public.room_record_feeding(integer,jsonb,uuid) to authenticated;
revoke all on function public.room_move_box(integer,text,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.room_move_box(integer,text,text,boolean,uuid,text) to authenticated;
commit;
notify pgrst,'reload schema';
