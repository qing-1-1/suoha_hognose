-- Immutable rule versions and confirmed preparation batches, layered over 039.
begin;
create table public.room_rule_versions (
 id uuid primary key default gen_random_uuid(),version integer not null unique check(version>0),
 name text not null check(length(btrim(name)) between 1 and 120),rules jsonb not null,
 created_at timestamptz not null default now(),created_by uuid references auth.users(id)
);
alter table public.room_workspace add column active_rule_version_id uuid references public.room_rule_versions(id);
create table public.room_preparation_batches (
 id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 120),
 confirmed_at timestamptz not null default now(),confirmed_by uuid not null references auth.users(id),
 rule_version_id uuid not null references public.room_rule_versions(id),room_revision integer not null,request_id uuid not null unique
);
create table public.room_preparation_items (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.room_preparation_batches(id),
 snake_id text not null references public.snakes(id) on delete restrict,
 slot_id text not null,cabinet_id text not null,planned_at timestamptz not null,due_at timestamptz not null,
 mouse_min_g numeric not null check(mouse_min_g>0),mouse_max_g numeric not null check(mouse_max_g>=mouse_min_g),
 quantity integer not null check(quantity between 1 and 100),rule_version_id uuid references public.room_rule_versions(id),unique(snake_id,planned_at)
);
alter table public.room_plan_snapshots add column batch_item_id uuid unique references public.room_preparation_items(id);
alter table public.room_plan_snapshots add column rule_version_id uuid references public.room_rule_versions(id);
alter table public.room_rule_versions enable row level security;
alter table public.room_preparation_batches enable row level security;
alter table public.room_preparation_items enable row level security;
revoke all on public.room_rule_versions,public.room_preparation_batches,public.room_preparation_items from public,anon,authenticated;

create function public.room_immutable_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin raise exception '已确认的规则版本和备料批次不可修改或删除'; end $$;
revoke all on function public.room_immutable_history() from public,anon,authenticated;
create trigger immutable_rule_version before update or delete on public.room_rule_versions for each row execute function public.room_immutable_history();
create trigger immutable_preparation_batch before update or delete on public.room_preparation_batches for each row execute function public.room_immutable_history();
create trigger immutable_preparation_item before update or delete on public.room_preparation_items for each row execute function public.room_immutable_history();

-- All callers, including the legacy layout RPC, retain every rule change as a version.
create function public.room_version_rules() returns trigger
language plpgsql security definer set search_path=public as $$
declare v integer; existing_rules jsonb; new_id uuid;
begin
 if new.config is null then return new; end if;
 select rules into existing_rules from public.room_rule_versions where id=new.active_rule_version_id;
 if existing_rules is distinct from new.config->'rules' then
  select coalesce(max(version),0)+1 into v from public.room_rule_versions;
  insert into public.room_rule_versions(version,name,rules,created_by) values(v,'规则版本 '||v,new.config->'rules',auth.uid()) returning id into new_id;
  new.active_rule_version_id:=new_id;
 end if;
 return new;
end $$;
revoke all on function public.room_version_rules() from public,anon,authenticated;
create trigger room_rule_version_guard before update on public.room_workspace for each row execute function public.room_version_rules();
-- Upgrade existing rooms without changing their optimistic revision.
update public.room_workspace set updated_at=updated_at where config is not null;

create function public.room_validate_label_template(p jsonb) returns void
language plpgsql set search_path=public as $$
declare line jsonb; token text;
begin
 if p is null or p='null'::jsonb then return; end if;
 if jsonb_typeof(p)<>'object' or length(coalesce(p->>'name','')) not between 1 and 120
 or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 6
 or coalesce(p->>'fontSize','')!~ '^\d+$' or (p->>'fontSize')::integer not between 12 and 20
 or coalesce(p->>'align','') not in ('left','center','right') then raise exception '标签模板格式无效'; end if;
 for line in select value from jsonb_array_elements(p->'lines') loop
  if jsonb_typeof(line)<>'string' or length(line#>>'{}')>160 then raise exception '标签模板每行最多 160 字'; end if;
  for token in select (regexp_matches(line#>>'{}','\{\{([^{}]*)\}\}','g'))[1] loop
   if token not in ('id','sex','gene','weight','mouse','next','note') then raise exception '未知标签字段：%',token; end if;
  end loop;
  if regexp_replace(line#>>'{}','\{\{(id|sex|gene|weight|mouse|next|note)\}\}','','g') ~ '(\{\{|\}\})' then raise exception '标签字段格式无效'; end if;
 end loop;
end $$;
revoke all on function public.room_validate_label_template(jsonb) from public,anon,authenticated;
alter function public.room_validate_config(jsonb) rename to room_validate_config_v039;
create function public.room_validate_config(p jsonb) returns void
language plpgsql set search_path=public as $$
declare c jsonb; k text; note jsonb; old_config jsonb;
begin
 perform public.room_validate_config_v039(p);
 perform public.room_validate_label_template(p->'labelTemplate');
 for c in select value from jsonb_array_elements(p->'cabinets') loop
  perform public.room_validate_label_template(c->'labelTemplate');
 end loop;
 if p ? 'slotNotes' then
  if jsonb_typeof(p->'slotNotes')<>'object' then raise exception '格位备注格式无效'; end if;
  for k,note in select key,value from jsonb_each(p->'slotNotes') loop
   if jsonb_typeof(note)<>'string' or length(note#>>'{}')>300 or not exists(select 1 from public.room_slots(p) where slot_id=k) then raise exception '格位备注须关联现有格位且不超过 300 字'; end if;
  end loop;
 end if;
 select config into old_config from public.room_workspace where id=1;
 if exists(select 1 from public.room_preparation_items i where
  (select o from jsonb_array_elements(coalesce(p->'taskOverrides','[]')) o where o->>'snakeId'=i.snake_id and (o->>'plannedAt')::timestamptz=i.planned_at)
  is distinct from
  (select o from jsonb_array_elements(coalesce(old_config->'taskOverrides','[]')) o where o->>'snakeId'=i.snake_id and (o->>'plannedAt')::timestamptz=i.planned_at))
 then raise exception '已确认备料的任务已锁定，不能改期或取消'; end if;
end $$;
revoke all on function public.room_validate_config(jsonb) from public,anon,authenticated;

-- Future plan syncs must not reprice, relocate or erase a confirmed batch snapshot.
create function public.room_preserve_batch_plan() returns trigger
language plpgsql security definer set search_path=public as $$
declare tz text; active_rule uuid;
begin
 if tg_op<>'INSERT' and old.batch_item_id is not null then return null; end if;
 if tg_op='DELETE' then return old; end if;
 select config->>'timezone',active_rule_version_id into tz,active_rule from public.room_workspace where id=1;
 if exists(select 1 from public.room_preparation_items i where i.snake_id=new.snake_id and i.planned_at<>new.planned_at
  and (i.due_at at time zone tz)::date=(new.due_at at time zone tz)::date) then return null; end if;
 if tg_op='INSERT' or new.batch_item_id is null then new.rule_version_id:=active_rule; end if;
 return new;
end $$;
revoke all on function public.room_preserve_batch_plan() from public,anon,authenticated;
create trigger preserve_batch_plan before insert or update or delete on public.room_plan_snapshots for each row execute function public.room_preserve_batch_plan();

create function public.room_check_batch_result() returns trigger
language plpgsql security definer set search_path=public as $$
declare item public.room_preparation_items;
begin
 select * into item from public.room_preparation_items where snake_id=new.snake_id and planned_at=new.planned_at;
 if found then
  if new.due_at<>item.due_at then raise exception '实际记录对应的备料计划时刻已锁定'; end if;
  if new.result in ('offered','fed') and (new.mouse_min_g,new.mouse_max_g,new.quantity) is distinct from (item.mouse_min_g,item.mouse_max_g,item.quantity)
   and length(btrim(new.notes))=0 then raise exception '实际用量与确认备料不同，请填写人工调整原因'; end if;
 end if;
 return new;
end $$;
revoke all on function public.room_check_batch_result() from public,anon,authenticated;
create trigger room_batch_result_guard before insert or update on public.room_feeding_records for each row execute function public.room_check_batch_result();

alter function public.room_snapshot() rename to room_snapshot_v039;
create function public.room_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
declare base jsonb;
begin
 base:=public.room_snapshot_v039();
 return base||jsonb_build_object(
  'active_rule_version_id',(select active_rule_version_id from public.room_workspace where id=1),
  'rule_versions',coalesce((select jsonb_agg(to_jsonb(v)-'created_by' order by version desc) from public.room_rule_versions v),'[]'::jsonb),
  'planned_tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('batch_id',i.batch_id) order by t.due_at,t.id) from public.room_plan_snapshots t left join public.room_preparation_items i on i.id=t.batch_item_id),'[]'::jsonb),
  'batches',coalesce((select jsonb_agg(to_jsonb(b)-'confirmed_by'||jsonb_build_object('items',
    coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('record',(select to_jsonb(f)-'actor_id' from public.room_feeding_records f where f.snake_id=i.snake_id and f.planned_at=i.planned_at)) order by i.due_at,i.cabinet_id,i.slot_id)
    from public.room_preparation_items i where i.batch_id=b.id),'[]'::jsonb)) order by b.confirmed_at desc,b.id) from public.room_preparation_batches b),'[]'::jsonb)
 );
end $$;
revoke all on function public.room_snapshot_v039(),public.room_snapshot() from public,anon,authenticated;
grant execute on function public.room_snapshot() to authenticated;

create function public.room_save_rule_version(p_revision integer,p_name text,p_rules jsonb,p_activate boolean,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb; next_version integer; new_id uuid;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','save_rule_version','name',p_name,'rules',p_rules,'activate',p_activate)) then return public.room_snapshot(); end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 120 or p_activate is null then raise exception '请填写规则版本名称和启用状态'; end if;
 select config into cfg from public.room_workspace where id=1;
 if cfg is null then raise exception '请先保存房间布局'; end if;
 perform public.room_validate_config(jsonb_set(cfg,'{rules}',p_rules));
 select coalesce(max(version),0)+1 into next_version from public.room_rule_versions;
 insert into public.room_rule_versions(version,name,rules,created_by) values(next_version,btrim(p_name),p_rules,auth.uid()) returning id into new_id;
 update public.room_workspace set revision=revision+1,updated_at=now(),
  config=case when p_activate then jsonb_set(config,'{rules}',p_rules) else config end,
  active_rule_version_id=case when p_activate then new_id else active_rule_version_id end where id=1;
 return public.room_snapshot();
end $$;

create function public.room_activate_rule_version(p_revision integer,p_version uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rule_data jsonb;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','activate_rule_version','version',p_version)) then return public.room_snapshot(); end if;
 select rules into rule_data from public.room_rule_versions where id=p_version;
 if not found then raise exception '规则版本不存在'; end if;
 update public.room_workspace set config=jsonb_set(config,'{rules}',rule_data),active_rule_version_id=p_version,revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;

create function public.room_confirm_batch(p_revision integer,p_name text,p_items jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b uuid; rule_id uuid; cfg jsonb; key jsonb; plan public.room_plan_snapshots; current_slot text; current_cabinet text; effective_due timestamptz; override_data jsonb; item_id uuid;
begin
 if not public.room_begin_write(p_revision,p_request,jsonb_build_object('op','confirm_batch','name',p_name,'items',p_items)) then return public.room_snapshot(); end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 120 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 5000 then raise exception '请填写批次名称并选择 1–5000 项计划'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) item group by item->>'snake_id',(item->>'planned_at')::timestamptz having count(*)>1) then raise exception '备料批次不能重复包含同一任务'; end if;
 select config,active_rule_version_id into cfg,rule_id from public.room_workspace where id=1;
 if rule_id is null then raise exception '请先配置房间规则'; end if;
 insert into public.room_preparation_batches(name,confirmed_by,rule_version_id,room_revision,request_id) values(btrim(p_name),auth.uid(),rule_id,p_revision,p_request) returning id into b;
 for key in select value from jsonb_array_elements(p_items) loop
  select * into plan from public.room_plan_snapshots where snake_id=key->>'snake_id' and planned_at=(key->>'planned_at')::timestamptz;
  if not found then raise exception '请先同步所选任务再确认备料'; end if;
  if plan.batch_item_id is not null or exists(select 1 from public.room_feeding_records where snake_id=plan.snake_id and planned_at=plan.planned_at) then raise exception '任务已确认备料或已有实际结果'; end if;
  if plan.mouse_min_g is null or plan.mouse_max_g is null or plan.quantity is null then raise exception '备料任务的鼠重或只数尚未确认'; end if;
  select a.slot_id,s.cabinet_id into current_slot,current_cabinet from public.room_assignments a join public.room_slots(cfg) s using(slot_id) join public.snakes n on n.id=a.snake_id where a.snake_id=plan.snake_id and n.status='active';
  if not found then raise exception '请先确认任务蛇只的实际位置'; end if;
  select o into override_data from jsonb_array_elements(coalesce(cfg->'taskOverrides','[]')) o where o->>'snakeId'=plan.snake_id and (o->>'plannedAt')::timestamptz=plan.planned_at;
  if (override_data->>'cancelled')::boolean then raise exception '已取消的计划不能确认备料'; end if;
  effective_due:=coalesce((override_data->>'overrideAt')::timestamptz,plan.due_at);
  if exists(select 1 from public.room_preparation_items i where i.snake_id=plan.snake_id and (i.due_at at time zone (cfg->>'timezone'))::date=(effective_due at time zone (cfg->>'timezone'))::date) then raise exception '该蛇当天已有确认备料，不能因改时刻重复加餐'; end if;
  insert into public.room_preparation_items(batch_id,snake_id,slot_id,cabinet_id,planned_at,due_at,mouse_min_g,mouse_max_g,quantity,rule_version_id)
   values(b,plan.snake_id,current_slot,current_cabinet,plan.planned_at,effective_due,plan.mouse_min_g,plan.mouse_max_g,plan.quantity,plan.rule_version_id) returning id into item_id;
  update public.room_plan_snapshots set batch_item_id=item_id,slot_id=current_slot,cabinet_id=current_cabinet,due_at=effective_due,frozen_at=now() where id=plan.id;
 end loop;
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;
-- A confirmed batch remains finishable when an animal has been moved to 待定位.
-- Its historical item supplies the record location without fabricating occupancy.
create or replace function public.room_record_feeding(p_revision integer,p_payload jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m uuid; happened timestamptz; planned timestamptz; due timestamptz; tz text; qty integer; low_g numeric; high_g numeric; status_text text; locked_item public.room_preparation_items;
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
revoke all on function public.room_save_rule_version(integer,text,jsonb,boolean,uuid),public.room_activate_rule_version(integer,uuid,uuid),public.room_confirm_batch(integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.room_save_rule_version(integer,text,jsonb,boolean,uuid),public.room_activate_rule_version(integer,uuid,uuid),public.room_confirm_batch(integer,text,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
