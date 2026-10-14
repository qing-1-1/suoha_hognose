-- Recalculate unconfirmed preparation from current weight; retain locked and actual history.
begin;
create or replace function public.room_confirm_batch(p_revision integer,p_name text,p_items jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b uuid; rule_id uuid; cfg jsonb; key jsonb; plan public.room_plan_snapshots; current_slot text; current_cabinet text; effective_due timestamptz; override_data jsonb; item_id uuid; latest_weight numeric; animal_sex text; mouse_rule jsonb;
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
  -- Pending estimates follow the latest valid measurement, including overdue tasks.
  -- Existing confirmed items and actual records are rejected above and never recalculated.
  select sex into animal_sex from public.snakes where id=plan.snake_id;
  select weight_g into latest_weight from public.snake_measurements
   where snake_id=plan.snake_id and weight_g>0 and weight_g::text ~ '^\d+(\.\d+)?$'
   and measured_at<=(now() at time zone (cfg->>'timezone'))::date order by measured_at desc,id desc limit 1;
  select r into mouse_rule from jsonb_array_elements(cfg->'rules') r
   where latest_weight>(r->>'min')::numeric and (r->>'max' is null or latest_weight<=(r->>'max')::numeric);
  plan.mouse_min_g:=(mouse_rule->>'mouseMin')::numeric;plan.mouse_max_g:=(mouse_rule->>'mouseMax')::numeric;
  if animal_sex='M' and (plan.mouse_min_g>6 or plan.mouse_max_g>8) then plan.mouse_min_g:=6;plan.mouse_max_g:=8;end if;
  plan.rule_version_id:=rule_id;
  if plan.mouse_min_g is null or plan.mouse_max_g is null or plan.quantity is null then raise exception '备料任务的鼠重或只数尚未确认，请补充有效称重'; end if;
  select a.slot_id,s.cabinet_id into current_slot,current_cabinet from public.room_assignments a join public.room_slots(cfg) s using(slot_id) join public.snakes n on n.id=a.snake_id where a.snake_id=plan.snake_id and n.status='active';
  if not found then raise exception '请先确认任务蛇只的实际位置'; end if;
  select o into override_data from jsonb_array_elements(coalesce(cfg->'taskOverrides','[]')) o where o->>'snakeId'=plan.snake_id and (o->>'plannedAt')::timestamptz=plan.planned_at;
  if (override_data->>'cancelled')::boolean then raise exception '已取消的计划不能确认备料'; end if;
  effective_due:=coalesce((override_data->>'overrideAt')::timestamptz,plan.due_at);
  if exists(select 1 from public.room_preparation_items i where i.snake_id=plan.snake_id and (i.due_at at time zone (cfg->>'timezone'))::date=(effective_due at time zone (cfg->>'timezone'))::date) then raise exception '该蛇当天已有确认备料，不能因改时刻重复加餐'; end if;
  insert into public.room_preparation_items(batch_id,snake_id,slot_id,cabinet_id,planned_at,due_at,mouse_min_g,mouse_max_g,quantity,rule_version_id)
   values(b,plan.snake_id,current_slot,current_cabinet,plan.planned_at,effective_due,plan.mouse_min_g,plan.mouse_max_g,plan.quantity,plan.rule_version_id) returning id into item_id;
  update public.room_plan_snapshots set mouse_min_g=plan.mouse_min_g,mouse_max_g=plan.mouse_max_g,rule_version_id=rule_id,warnings='[]'::jsonb,batch_item_id=item_id,slot_id=current_slot,cabinet_id=current_cabinet,due_at=effective_due,frozen_at=now() where id=plan.id;
 end loop;
 update public.room_workspace set revision=revision+1,updated_at=now() where id=1;
 return public.room_snapshot();
end $$;
revoke all on function public.room_confirm_batch(integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.room_confirm_batch(integer,text,jsonb,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
