-- Apply after 046. Manual sale/unlisting history; no existing animals are changed.
begin;
create table public.listing_inventory_events (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique, actor_id uuid not null references auth.users(id),
 listing_id uuid not null references public.specimen_listings(id),
 snake_id text not null references public.snakes(id),
 action text not null check(action in ('sell','unlist')), payload jsonb not null,
 sold_on date, amount numeric(12,2) check(amount>=0), currency text not null,
 customer_note text not null default '' check(length(customer_note)<=500),
 note text not null default '' check(length(note)<=2000), snapshot jsonb not null,
 returned_at timestamptz, created_at timestamptz not null default now(),
 check((action='sell' and sold_on is not null) or (action='unlist' and sold_on is null and amount is null)),
 check(returned_at is null or action='sell')
);
create unique index one_current_manual_sale on public.listing_inventory_events(snake_id) where action='sell' and returned_at is null;
alter table public.listing_inventory_events enable row level security;
revoke all on public.listing_inventory_events from public,anon,authenticated;
grant select on public.listing_inventory_events to authenticated;
create policy listing_events_staff on public.listing_inventory_events for select to authenticated using(public.can_edit_app());

create function public.manage_listing_inventory(p_listing uuid,p_action text,p_request uuid,p_expected_updated_at timestamptz,
 p_sold_on date default null,p_amount numeric default null,p_customer_note text default '',p_note text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare l public.specimen_listings; s public.snakes; prior public.listing_inventory_events;
 payload jsonb; room public.room_workspace; slot text;
begin
 if public.can_edit_app() is not true or auth.uid() is null then raise exception 'Not authorized';end if;
 if p_request is null or p_listing is null or p_action is null or p_action not in ('sell','unlist') then raise exception '操作参数无效';end if;
 p_note:=btrim(coalesce(p_note,''));p_customer_note:=btrim(coalesce(p_customer_note,''));
 if length(p_note)>2000 or length(p_customer_note)>500 then raise exception '备注超出长度限制';end if;
 if p_action='sell' and (p_sold_on is null or p_sold_on>(current_timestamp at time zone 'Asia/Shanghai')::date
  or p_amount<0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)) then raise exception '请填写有效成交日期和金额（最多两位小数）';end if;
 if p_action='unlist' and (p_note='' or p_sold_on is not null or p_amount is not null or p_customer_note<>'') then raise exception '请填写下架原因，不需要成交信息';end if;
 payload:=jsonb_build_object('listing',p_listing,'action',p_action,'version',p_expected_updated_at,'sold_on',p_sold_on,'amount',p_amount,'customer_note',p_customer_note,'note',p_note);
 perform pg_advisory_xact_lock(hashtextextended('listing-inventory:'||p_request::text,0));
 select * into prior from public.listing_inventory_events where request_id=p_request;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception '请求编号冲突';end if;
  return jsonb_build_object('snake_id',prior.snake_id,'action',prior.action,'request_id',prior.request_id);
 end if;
 select * into room from public.room_workspace where id=1 for update;
 select * into l from public.specimen_listings where id=p_listing for update;
 if not found then raise exception '展示档案不存在';end if;
 if p_expected_updated_at is null or l.updated_at is distinct from p_expected_updated_at then raise exception '展示档案已变化，请关闭弹窗、刷新后重试';end if;
 select * into s from public.snakes where id=l.snake_id for update;
 if s.status is distinct from 'active' or not l.published or l.deleted_at is not null
  or l.sale_status not in ('available','display') or (p_action='sell' and l.sale_status<>'available') then raise exception '请从已上架、在养的个体操作；标记已售需处于在售状态';end if;
 if exists(select 1 from public.auctions where listing_id=l.id and status='open') then raise exception '个体正在拍卖，请先处理拍卖';end if;
 if exists(select 1 from public.purchase_inquiries where listing_id=l.id and status in ('reserved','paid','delivered','completed') and returned_at is null) then raise exception '个体仍有有效交易，请先在意向与销售处理';end if;
 if exists(select 1 from public.payment_receipts r join public.purchase_inquiries i on i.id=r.inquiry_id where i.listing_id=l.id and r.status='pending') then raise exception '个体仍有待核实付款，请先处理';end if;
 insert into public.listing_inventory_events(request_id,actor_id,listing_id,snake_id,action,payload,sold_on,amount,currency,customer_note,note,snapshot)
 values(p_request,auth.uid(),l.id,s.id,p_action,payload,p_sold_on,p_amount,l.currency,p_customer_note,p_note,jsonb_build_object('animal',to_jsonb(s),'listing',to_jsonb(l)));
 if p_action='sell' then
  select slot_id into slot from public.room_assignments where snake_id=s.id;
  if slot is not null then
   if public.room_slot_cabinet(room.config,slot)->>'type'='incubator' then raise exception '个体正在孵化柜内冬化，请先确认结束冬化并移出';end if;
   perform public.room_assign(room.revision,s.id,null,false,gen_random_uuid(),'inherit');
  end if;
  update public.specimen_listings set sale_status='sold' where id=l.id;
  update public.snakes set status='sold' where id=s.id;
 else
  update public.specimen_listings set published=false,sale_status='display' where id=l.id;
 end if;
 return jsonb_build_object('snake_id',s.id,'action',p_action,'request_id',p_request);
end $$;
revoke all on function public.manage_listing_inventory(uuid,text,uuid,timestamptz,date,numeric,text,text) from public,anon;
grant execute on function public.manage_listing_inventory(uuid,text,uuid,timestamptz,date,numeric,text,text) to authenticated;

-- Keep historical order/receipt APIs, but stop creation even via the old service RPC.
create or replace function public.purchase_now(p_token text,p_listing uuid,p_request uuid) returns uuid
language plpgsql security definer set search_path=public as $$
begin raise exception '直接购买已关闭，请联系店铺';end $$;

create or replace function public.return_sold_animals(p_ids text[],p_reason text,p_request uuid) returns jsonb
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
   values(p_request,item,item,btrim(p_reason),jsonb_build_object('animal',to_jsonb(animal),'listing',to_jsonb(listing),'completed_inquiry_ids',completed_ids,'manual_sales',coalesce((select jsonb_agg(to_jsonb(e)) from public.listing_inventory_events e where e.snake_id=item and e.action='sell' and e.returned_at is null),'[]'::jsonb)),auth.uid());
  update public.listing_inventory_events set returned_at=now() where snake_id=item and action='sell' and returned_at is null;
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

-- Returned historical orders no longer prevent opening a new auction.
create or replace function public.create_auction(p_listing uuid,p_price numeric,p_increment numeric,p_idle integer,p_starts timestamptz,p_first_hours integer,p_max_hours integer,p_payment_hours integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare l specimen_listings; result uuid; begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 select * into l from specimen_listings where id=p_listing for update;
 if l.id is null or not l.published or l.deleted_at is not null or l.sale_status<>'available' or l.currency<>'CNY' then raise exception '请选择已发布、在售的人民币个体'; end if;
 if exists(select 1 from purchase_inquiries where listing_id=l.id and status in ('reserved','paid','delivered','completed') and returned_at is null) then raise exception '个体已有有效交易'; end if;
 if p_starts is null or p_starts<clock_timestamp()-interval '5 minutes' or p_first_hours not between 1 and 720 or (p_max_hours is not null and p_max_hours not between p_first_hours and 720) or p_price<>round(p_price,2) or p_increment<>round(p_increment,2) then raise exception '请检查开拍时间、价格及期限'; end if;
 insert into auctions(listing_id,start_price,increment,idle_minutes,starts_at,ends_at,hard_ends_at,payment_hours)
 values(l.id,p_price,p_increment,p_idle,p_starts,p_starts+make_interval(hours=>p_first_hours),p_starts+make_interval(hours=>p_max_hours),p_payment_hours) returning id into result;
 return result;
end $$;


commit;
notify pgrst,'reload schema';
