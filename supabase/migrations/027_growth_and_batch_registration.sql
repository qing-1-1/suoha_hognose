-- Private growth records, retention assessments and atomic retry-safe registration.
begin;
alter table public.snake_measurements add column record_kind text not null default 'measurement'
 check(record_kind in ('measurement','feeding','shedding','observation'));
alter table public.inventory_transfers add column assessment text not null default '' check(length(assessment)<=2000);
create table public.hatchling_registration_batches(
 request_id uuid primary key, actor_id uuid not null references auth.users(id),
 clutch_id bigint not null references public.clutches(id), payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
alter table public.hatchling_registration_batches enable row level security;
revoke all on public.hatchling_registration_batches from public,anon,authenticated;

create function public.register_hatchlings_batch(p_request uuid,p_clutch bigint,p_rows jsonb,p_investor text)
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
   if length(btrim(coalesce(r->>'series','')))=0 or length(btrim(coalesce(r->>'gene_text','')))=0 then raise exception '系列及基因描述不能为空，未确认请注明'; end if;
   if (r->>'birth')::date<c.hatch_start_date or (r->>'birth')::date>c.hatch_end_date then raise exception '实际出壳日期不在本窝记录范围内'; end if;
   if exists(select 1 from public.snakes where id=r->>'id') then raise exception '编号 % 已存在',r->>'id'; end if;
   perform public.register_hatchling(p_clutch,r->>'id',r->>'sex',(r->>'birth')::date,r->>'series',r->>'gene_text',p_investor);
   result:=result||jsonb_build_array(r->>'id');
  exception when others then raise exception '第 % 行（%）：%',n,coalesce(r->>'id','未填编号'),sqlerrm;
  end;
 end loop;
 insert into public.hatchling_registration_batches values(p_request,auth.uid(),p_clutch,expected,result,now());
 return result;
end $$;
revoke all on function public.register_hatchlings_batch(uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.register_hatchlings_batch(uuid,bigint,jsonb,text) to authenticated;

create function public.retain_inventory_animal(p_id text,p_assessment text default '') returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 perform 1 from public.snakes where id=p_id for update;
 if not found then raise exception 'Animal not found'; end if;
 if exists(select 1 from public.snakes where id=p_id and inventory_library='stock') then return; end if;
 perform public.transfer_inventory_animal(p_id,'stock');
 update public.inventory_transfers set assessment=left(coalesce(p_assessment,''),2000)
 where id=(select max(id) from public.inventory_transfers where individual_id=p_id);
end $$;
revoke all on function public.retain_inventory_animal(text,text) from public,anon;
grant execute on function public.retain_inventory_animal(text,text) to authenticated;
commit;
notify pgrst,'reload schema';
