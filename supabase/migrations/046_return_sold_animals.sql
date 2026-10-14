-- Apply after 045. Adds an explicit, audited return workflow; does not return animals automatically.
begin;
alter table public.purchase_inquiries add column returned_at timestamptz;
alter table public.purchase_inquiries add constraint inquiry_return_completed check(returned_at is null or status='completed');
-- A historical completed sale remains completed, but no longer blocks a later sale after return.
drop index public.one_active_specimen_reservation;
create unique index one_active_specimen_reservation on public.purchase_inquiries(listing_id)
 where status in ('reserved','paid','delivered','completed') and returned_at is null;

create table public.sold_return_requests (
 request_id uuid primary key, actor_id uuid not null references auth.users(id),
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.sold_return_history (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.sold_return_requests(request_id),
 snake_id text references public.snakes(id) on delete set null,
 individual_id text not null, reason text not null,
 snapshot jsonb not null, actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(request_id,individual_id)
);
alter table public.sold_return_requests enable row level security;
alter table public.sold_return_history enable row level security;
revoke all on public.sold_return_requests,public.sold_return_history from public,anon,authenticated;
grant select on public.sold_return_history to authenticated;
create policy sold_returns_read on public.sold_return_history for select to authenticated using(public.can_edit_app());

create function public.return_sold_animals(p_ids text[],p_reason text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare ids text[];payload jsonb;prior public.sold_return_requests;animal public.snakes;
 listing public.specimen_listings;item text;completed_ids uuid[];result jsonb;
begin
 if public.can_edit_app() is not true or auth.uid() is null then raise exception 'Not authorized';end if;
 if p_request is null or cardinality(p_ids) is null or cardinality(p_ids) not between 1 and 5000
  or exists(select 1 from unnest(p_ids) id where id is null or btrim(id)='') then raise exception '请选择需要回库的已售个体';end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception '请填写回库原因（最多 2000 字）';end if;
 select array_agg(id order by id) into ids from (select distinct unnest(p_ids) id) requested;
 payload:=jsonb_build_object('ids',ids,'reason',btrim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended('sold-return:'||p_request::text,0));
 select * into prior from public.sold_return_requests where request_id=p_request;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception '回库请求编号冲突';end if;
  return prior.result;
 end if;
 -- Room operations lock this row before animals; sales lock listings before animals.
 perform 1 from public.room_workspace where id=1 for update;
 perform 1 from public.specimen_listings where snake_id=any(ids) order by id for update;
 perform 1 from public.snakes where id=any(ids) order by id for update;
 if (select count(*) from public.snakes where id=any(ids))<>cardinality(ids) then raise exception '部分个体已不存在，请刷新后重试';end if;
 result:=jsonb_build_object('returned_ids',ids,'count',cardinality(ids));
 insert into public.sold_return_requests values(p_request,auth.uid(),payload,result,now());
 foreach item in array ids loop
  select * into animal from public.snakes where id=item;
  select * into listing from public.specimen_listings where snake_id=item;
  if animal.status not in ('active','sold') or animal.status is null
    or (animal.status<>'sold' and listing.sale_status is distinct from 'sold') then
   raise exception '% 不是可回库的已售个体，请刷新后重试',item;
  end if;
  if listing.id is not null then
   if exists(select 1 from public.auctions where listing_id=listing.id and status='open') then raise exception '% 仍有进行中的拍卖，请先处理',item;end if;
   if exists(select 1 from public.purchase_inquiries where listing_id=listing.id and status in ('reserved','paid','delivered')) then raise exception '% 仍有未结束交易，请先处理',item;end if;
   if exists(select 1 from public.payment_receipts r join public.purchase_inquiries i on i.id=r.inquiry_id where i.listing_id=listing.id and r.status='pending') then raise exception '% 仍有待核实付款，请先处理',item;end if;
  end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into completed_ids from public.purchase_inquiries
   where listing_id=listing.id and status='completed' and returned_at is null;
  insert into public.sold_return_history(request_id,snake_id,individual_id,reason,snapshot,actor_id)
   values(p_request,item,item,btrim(p_reason),jsonb_build_object('animal',to_jsonb(animal),'listing',to_jsonb(listing),'completed_inquiry_ids',completed_ids),auth.uid());
  update public.purchase_inquiries set returned_at=now() where id=any(completed_ids);
  insert into public.sales_activity(inquiry_id,actor_id,action,note)
   select unnest(completed_ids),auth.uid(),'returned_to_stock',btrim(p_reason);
  -- Clear the sold listing first so the lifecycle guard permits the explicit correction.
  update public.specimen_listings set sale_status='display',published=false where id=listing.id;
  update public.snakes set status='active',inventory_library='stock' where id=item;
  insert into public.inventory_transfers(snake_id,individual_id,from_library,to_library,actor_id,assessment)
   values(item,item,animal.inventory_library,'stock',auth.uid(),'已售回库：'||btrim(p_reason));
 end loop;
 return result;
end $$;
revoke all on function public.return_sold_animals(text[],text,uuid) from public,anon;
grant execute on function public.return_sold_animals(text[],text,uuid) to authenticated;
commit;
notify pgrst,'reload schema';
