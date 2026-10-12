-- Audit PO02 / NU01 / IN01. Deploy after 035, before the new frontend.
begin;
create function public.register_hatchling_series(p_clutch bigint,p_id text,p_sex text,p_birth date,p_series_names text[],p_gene_text text,p_investor text)
returns text language plpgsql security definer set search_path=public as $$
declare c public.clutches;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if coalesce(cardinality(p_series_names),0)=0 or exists(select 1 from unnest(p_series_names) n where n is null or length(btrim(n)) not between 1 and 100) then raise exception '请选择有效系列'; end if;
 select * into c from public.clutches where id=p_clutch for update;
 if p_birth<c.hatch_start_date or p_birth>c.hatch_end_date then raise exception '实际出壳日期不在本窝记录范围内'; end if;
 perform public.register_hatchling(p_clutch,p_id,p_sex,p_birth,p_series_names[1],p_gene_text,p_investor);
 update public.snakes set series_names=p_series_names where id=p_id;
 return p_id;
end $$;
revoke all on function public.register_hatchling_series(bigint,text,text,date,text[],text,text) from public,anon;
grant execute on function public.register_hatchling_series(bigint,text,text,date,text[],text,text) to authenticated;

create function public.save_snake_profile(p_id text,p_data jsonb,p_genes jsonb,p_new_genes jsonb default '[]')
returns text language plpgsql security definer set search_path=public as $$
declare s public.snakes; g jsonb; target text; names text[];
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_genes) is distinct from 'array' or jsonb_typeof(p_new_genes) is distinct from 'array' then raise exception 'Invalid profile payload'; end if;
 target:=coalesce(p_id,p_data->>'id');
 if coalesce(target,'') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'Invalid animal ID'; end if;
 if p_id is not null then
  select * into s from public.snakes where id=p_id for update;
  if not found then raise exception 'Animal not found'; end if;
 end if;
 s:=jsonb_populate_record(s,p_data);
 select array_agg(value) into names from jsonb_array_elements_text(p_data->'series_names');
 if coalesce(cardinality(names),0)=0 or exists(select 1 from unnest(names) n where n is null or length(btrim(n)) not between 1 and 100) then raise exception '请选择有效系列'; end if;
 if s.birth_date>current_date or s.mature_date<s.birth_date then raise exception '请检查出生和成熟日期'; end if;
 if nullif(btrim(s.gene_text),'') is null then raise exception '请填写基因描述'; end if;
 if p_id is null then
  insert into public.snakes(id,series_names,gene_text,sex,status,birth_date,mature_date,price,strategic_score,investor,origin,role,notes,sire_id,dam_id,clutch_id)
  values(target,names,s.gene_text,s.sex,s.status,s.birth_date,s.mature_date,s.price,s.strategic_score,s.investor,s.origin,s.role,s.notes,s.sire_id,s.dam_id,s.clutch_id);
 else
  update public.snakes set series_names=names,gene_text=s.gene_text,sex=s.sex,status=s.status,birth_date=s.birth_date,mature_date=s.mature_date,price=s.price,strategic_score=s.strategic_score,investor=s.investor,origin=s.origin,role=s.role,notes=s.notes,sire_id=s.sire_id,dam_id=s.dam_id,clutch_id=s.clutch_id where id=target;
 end if;
 for g in select value from jsonb_array_elements(p_new_genes) loop
  if coalesce(g->>'id','') !~ '^[a-z][a-z0-9_]{1,63}$' or nullif(btrim(g->>'name_zh'),'') is null then raise exception '请检查新基因编号和名称'; end if;
  insert into public.genes(id,code,name_zh,name_en,inheritance_type) values(g->>'id',null,g->>'name_zh',g->>'name_en',g->>'inheritance_type');
 end loop;
 delete from public.snake_genes where snake_id=target;
 for g in select value from jsonb_array_elements(p_genes) loop
  if not exists(select 1 from public.genes where id=g->>'gene_id') then raise exception 'Gene not found'; end if;
  if coalesce(g->>'state','') not in ('visual','het','possible_het','super','line_trait','unknown') or (g->>'probability')::numeric not between 0 and 1 then raise exception 'Invalid gene state or probability'; end if;
  insert into public.snake_genes(snake_id,gene_id,state,probability,source,notes) values(target,g->>'gene_id',g->>'state',(g->>'probability')::numeric,g->>'source',g->>'notes');
 end loop;
 return target;
end $$;
revoke all on function public.save_snake_profile(text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_snake_profile(text,jsonb,jsonb,jsonb) to authenticated;

create table public.expense_requests(request_id uuid primary key,owner_id uuid not null references auth.users(id),payload jsonb not null,expense_id uuid not null,created_at timestamptz not null default now());
alter table public.expense_requests enable row level security;
revoke all on public.expense_requests from public,anon,authenticated;
create function public.record_investment_expense(p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare prior public.expense_requests; result uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Not authorized'; end if;
 if p_request is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.expense_requests where request_id=p_request;
 if found then
  if prior.owner_id<>auth.uid() or prior.payload<>p_data then raise exception 'Request conflict'; end if;
  return prior.expense_id;
 end if;
 if (p_data->>'spent_at')::date>current_date then raise exception '实际支出日期不能晚于今天'; end if;
 insert into public.investment_expenses(category,amount,note,spent_at,owner_id,owner_email,owner_name,acquisition_id)
 values(p_data->>'category',(p_data->>'amount')::numeric,p_data->>'note',(p_data->>'spent_at')::date,auth.uid(),p_data->>'owner_email',p_data->>'owner_name',(p_data->>'acquisition_id')::uuid) returning id into result;
 insert into public.expense_requests(request_id,owner_id,payload,expense_id) values(p_request,auth.uid(),p_data,result);
 return result;
end $$;
revoke all on function public.record_investment_expense(uuid,jsonb) from public,anon;
grant execute on function public.record_investment_expense(uuid,jsonb) to authenticated;
create or replace function public.register_hatchlings_batch(p_request uuid,p_clutch bigint,p_rows jsonb,p_investor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare prior public.hatchling_registration_batches; c public.clutches; r jsonb; result jsonb:='[]'; n integer:=0; expected jsonb;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if p_request is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid batch'; end if;
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>50 then raise exception '每批请登记 1–50 条'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 expected:=jsonb_build_object('rows',p_rows,'investor',p_investor);
 select * into prior from public.hatchling_registration_batches where request_id=p_request;
 if found then
  if prior.actor_id<>auth.uid() or prior.clutch_id<>p_clutch or prior.payload<>expected then raise exception 'Batch request conflict'; end if;
  return prior.result;
 end if;
 select * into c from public.clutches where id=p_clutch for update;
 if not found or c.status<>'hatched' then raise exception '请先记录已孵化窝次'; end if;
 if c.hatched_count is null or (select count(*) from public.snakes where clutch_id=p_clutch)+jsonb_array_length(p_rows)>c.hatched_count then
  raise exception '登记数量超过本窝实际已孵化数';
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  begin
   if coalesce(r->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception '编号格式不正确'; end if;
   if coalesce(r->>'sex','') not in ('M','F','U') then raise exception '请确认性别或选择未知'; end if;
   if coalesce(jsonb_array_length(r->'series_names'),case when nullif(btrim(r->>'series'),'') is null then 0 else 1 end)=0 or length(btrim(coalesce(r->>'gene_text','')))=0 then raise exception '系列及基因描述不能为空，未确认请注明'; end if;
   if (r->>'birth')::date<c.hatch_start_date or (r->>'birth')::date>c.hatch_end_date then raise exception '实际出壳日期不在本窝记录范围内'; end if;
   if exists(select 1 from public.snakes where id=r->>'id') then raise exception '编号 % 已存在',r->>'id'; end if;
   perform public.register_hatchling_series(p_clutch,r->>'id',r->>'sex',(r->>'birth')::date,case when r ? 'series_names' then array(select jsonb_array_elements_text(r->'series_names')) else array[r->>'series'] end,r->>'gene_text',p_investor);
   result:=result||jsonb_build_array(r->>'id');
  exception when others then raise exception '第 % 行（%）：%',n,coalesce(r->>'id','未填编号'),sqlerrm;
  end;
 end loop;
 insert into public.hatchling_registration_batches values(p_request,auth.uid(),p_clutch,expected,result,now());
 return result;
end $$;
revoke all on function public.register_hatchlings_batch(uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.register_hatchlings_batch(uuid,bigint,jsonb,text) to authenticated;


commit;
notify pgrst,'reload schema';
