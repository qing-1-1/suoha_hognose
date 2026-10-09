-- Independent buyer identities never receive workspace/Auth membership.
-- Apply once after 028. Run the complete file, then 030 and 031.
begin;
create table public.auction_buyers (
 id uuid primary key default gen_random_uuid(), username text unique not null,
 password_hash text not null, contact text not null, created_at timestamptz not null default now(),
 check(username ~ '^[a-z0-9_]{4,30}$'), check(length(contact) between 3 and 200)
);
create table public.auction_sessions(token_hash text primary key, buyer_id uuid not null references public.auction_buyers(id), expires_at timestamptz not null);
create table public.auction_rate_limits(key text primary key, attempts integer not null, window_start timestamptz not null);
create table public.auctions (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.specimen_listings(id),
 status text not null default 'open' check(status in ('open','won','unsold','cancelled')),
 start_price numeric(12,2) not null check(start_price>0 and start_price<=9999999999.99), increment numeric(12,2) not null check(increment>0 and increment<=9999999999.99),
 idle_minutes integer not null check(idle_minutes between 1 and 10080),
 starts_at timestamptz not null, ends_at timestamptz not null, hard_ends_at timestamptz,
 payment_hours integer not null check(payment_hours between 1 and 168),
 current_price numeric(12,2), winner_id uuid references public.auction_buyers(id), bid_count integer not null default 0,
 inquiry_id uuid references public.purchase_inquiries(id), cancel_reason text, created_at timestamptz not null default now(),
 check(isfinite(starts_at) and ends_at>starts_at and (hard_ends_at is null or (isfinite(hard_ends_at) and hard_ends_at>=ends_at)))
);
create unique index one_open_auction on public.auctions(listing_id) where status='open';
create index auction_due on public.auctions(ends_at) where status='open';
create table public.auction_bids (
 id bigint generated always as identity primary key, request_id uuid unique not null,
 auction_id uuid not null references public.auctions(id), buyer_id uuid not null references public.auction_buyers(id),
 amount numeric(12,2) not null, created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['auction_buyers','auction_sessions','auction_rate_limits','auctions','auction_bids'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
end loop;
end $$;

grant select on public.auctions,public.auction_bids to authenticated;
create policy auction_staff on public.auctions for select to authenticated using(public.can_edit_app());
create policy bid_staff on public.auction_bids for select to authenticated using(public.can_edit_app());

create function public.auction_rate(p_key text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; begin
 insert into auction_rate_limits values(p_key,1,clock_timestamp()) on conflict(key) do update
 set attempts=case when auction_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then 1 else auction_rate_limits.attempts+1 end,
 window_start=case when auction_rate_limits.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else auction_rate_limits.window_start end
 returning attempts into n;
 return n<=30;
end $$;
create function public.auction_identity(p_action text,p_username text default '',p_hash text default '',p_contact text default '',p_token text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare b auction_buyers; begin
 if p_action='register' then
 insert into auction_buyers(username,password_hash,contact) values(p_username,p_hash,p_contact) returning * into b;
 elsif p_action='credentials' then select * into b from auction_buyers where username=p_username;
 return case when b.id is null then null else jsonb_build_object('id',b.id,'hash',b.password_hash) end;
 elsif p_action='session' then
 select * into b from auction_buyers where username=p_username;
 if b.id is null then raise exception '账号不存在'; end if;
 elsif p_action='logout' then delete from auction_sessions where token_hash=p_token; return '{}'::jsonb;
 else raise exception 'Invalid action'; end if;
 insert into auction_sessions values(p_token,b.id,clock_timestamp()+interval '7 days');
 return jsonb_build_object('username',b.username);
end $$;

-- All sale mutations lock the listing first. The guard also covers old inquiry RPCs.
create function public.guard_auction_listing() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from auctions where listing_id=old.id and status='open') and
 (new.sale_status is distinct from old.sale_status or new.published is distinct from old.published or new.deleted_at is distinct from old.deleted_at or new.currency is distinct from old.currency or new.asking_price is distinct from old.asking_price) then
 raise exception '拍卖进行中，请先在拍卖管理结束或取消'; end if;
 return new;
end $$;
create trigger auction_listing_guard before update on public.specimen_listings for each row execute function public.guard_auction_listing();
create function public.guard_auction_inquiry() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from specimen_listings where id=new.listing_id for update;
 if exists(select 1 from auctions where listing_id=new.listing_id and status='open') then raise exception '此个体正在拍卖，请通过竞拍出价'; end if;
 return new;
end $$;
create trigger auction_inquiry_guard before insert on public.purchase_inquiries for each row execute function public.guard_auction_inquiry();

create function public.create_auction(p_listing uuid,p_price numeric,p_increment numeric,p_idle integer,p_starts timestamptz,p_first_hours integer,p_max_hours integer,p_payment_hours integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare l specimen_listings; result uuid; begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 select * into l from specimen_listings where id=p_listing for update;
 if l.id is null or not l.published or l.deleted_at is not null or l.sale_status<>'available' or l.currency<>'CNY' then raise exception '请选择已发布、在售的人民币个体'; end if;
 if exists(select 1 from purchase_inquiries where listing_id=l.id and status in ('reserved','paid','delivered','completed')) then raise exception '个体已有有效交易'; end if;
 if p_starts is null or p_starts<clock_timestamp()-interval '5 minutes' or p_first_hours not between 1 and 720 or (p_max_hours is not null and p_max_hours not between p_first_hours and 720) or p_price<>round(p_price,2) or p_increment<>round(p_increment,2) then raise exception '请检查开拍时间、价格及期限'; end if;
 insert into auctions(listing_id,start_price,increment,idle_minutes,starts_at,ends_at,hard_ends_at,payment_hours)
 values(l.id,p_price,p_increment,p_idle,p_starts,p_starts+make_interval(hours=>p_first_hours),p_starts+make_interval(hours=>p_max_hours),p_payment_hours) returning id into result;
 return result;
end $$;

create function public.settle_auction(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare a auctions; b auction_buyers; l specimen_listings; sale uuid; begin
 select l0.* into l from specimen_listings l0 join auctions a0 on a0.listing_id=l0.id where a0.id=p_id for update of l0;
 select * into a from auctions where id=p_id for update;
 if a.id is null or a.status<>'open' or a.ends_at>clock_timestamp() then return; end if;
 update auctions set status=case when winner_id is null then 'unsold' else 'won' end where id=a.id;
 if a.winner_id is null then return; end if;
 select * into b from auction_buyers where id=a.winner_id;
 insert into purchase_inquiries(request_id,listing_id,customer_name,contact,message,fingerprint,status,reserved_until,agreed_price,currency)
 values(a.id,l.id,b.username,b.contact,'拍卖成交；请人工核实收款。场次：'||a.id,'auction:'||a.id,'reserved',clock_timestamp()+make_interval(hours=>a.payment_hours),a.current_price,'CNY') returning id into sale;
 update specimen_listings set sale_status='reserved' where id=l.id;
 update auctions set inquiry_id=sale where id=a.id;
 insert into sales_activity(inquiry_id,action,note) values(sale,'auction_won','拍卖自动成交，等待付款；到期需人工核实后处理');
end $$;
create function public.settle_due_auctions() returns integer language plpgsql security definer set search_path=public as $$
declare a record; n integer:=0; begin
 for a in select id from auctions where status='open' and ends_at<=clock_timestamp() order by ends_at limit 100 loop
 perform settle_auction(a.id); n:=n+1; end loop;
 delete from auction_sessions where expires_at<clock_timestamp();
 delete from auction_rate_limits where window_start<clock_timestamp()-interval '1 day';
 return n;
end $$;
create function public.cancel_auction(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare a auctions; begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception '请填写取消原因'; end if;
 perform 1 from specimen_listings where id=(select listing_id from auctions where id=p_id) for update;
 perform settle_auction(p_id);
 select * into a from auctions where id=p_id for update;
 if a.status is distinct from 'open' then raise exception '拍卖已结束，请刷新'; end if;
 update auctions set status='cancelled',cancel_reason=p_reason where id=p_id;
end $$;

create function public.place_auction_bid(p_token text,p_id uuid,p_amount numeric,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare buyer uuid; a auctions; old_bid auction_bids; t timestamptz; begin
 select buyer_id into buyer from auction_sessions where token_hash=p_token and expires_at>clock_timestamp();
 if buyer is null then raise exception '请先登录竞拍账号'; end if;
 perform 1 from specimen_listings where id=(select listing_id from auctions where id=p_id) for update;
 select * into a from auctions where id=p_id for update;
 select * into old_bid from auction_bids where request_id=p_request;
 if old_bid.id is not null then
 if old_bid.buyer_id<>buyer or old_bid.auction_id<>p_id or old_bid.amount<>p_amount then raise exception '请求编号冲突'; end if;
 return jsonb_build_object('accepted',true); end if;
 t:=clock_timestamp();
 if a.id is null or a.status<>'open' or t<a.starts_at or t>=a.ends_at then raise exception '拍卖未开始或已结束'; end if;
 if a.winner_id=buyer then raise exception '你已领先，无需继续加价'; end if;
 if p_amount is null or p_amount<>round(p_amount,2) or p_amount<coalesce(a.current_price+a.increment,a.start_price) or p_amount>9999999999.99 then raise exception '报价低于最低出价或金额格式错误，请刷新'; end if;
 insert into auction_bids(request_id,auction_id,buyer_id,amount) values(p_request,p_id,buyer,p_amount);
 -- Soft close: preserve the existing deadline; a late bid opens a full new interval.
 -- A hard cap applies ONLY if staff explicitly chose one; NULL means unlimited extension.
 update auctions set current_price=p_amount,winner_id=buyer,bid_count=bid_count+1,ends_at=least(greatest(ends_at,t+make_interval(mins=>idle_minutes)),hard_ends_at) where id=p_id;
 return jsonb_build_object('accepted',true);
end $$;

create function public.read_auctions(p_listing uuid default null,p_token text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare buyer uuid; result jsonb; begin
 select buyer_id into buyer from auction_sessions where token_hash=p_token and expires_at>clock_timestamp();
 if p_listing is not null then
 perform settle_auction(id) from auctions where listing_id=p_listing and status='open' and ends_at<=clock_timestamp();
 end if;
 select coalesce(jsonb_agg(v.data order by v.created_at desc),'[]'::jsonb) into result from (
 select a.created_at,jsonb_build_object('id',a.id,'listing_id',l.id,'title',l.title,'slug',l.slug,'status',a.status,
 'start_price',a.start_price,'increment',a.increment,'idle_minutes',a.idle_minutes,'starts_at',a.starts_at,'ends_at',a.ends_at,'hard_ends_at',a.hard_ends_at,
 'current_price',a.current_price,'bid_count',a.bid_count,'payment_hours',a.payment_hours,'cancel_reason',a.cancel_reason,
 'leading',coalesce(a.winner_id=buyer,false),'participated',exists(select 1 from auction_bids where auction_id=a.id and buyer_id=buyer),
 'order',case when a.winner_id=buyer then (select jsonb_build_object('id',id,'reference',reference,'status',status,'amount',agreed_price,'reserved_until',reserved_until) from purchase_inquiries where id=a.inquiry_id) else null end,
 'bids',coalesce((select jsonb_agg(jsonb_build_object('number',r.id,'amount',r.amount,'at',r.created_at,'mine',coalesce(r.buyer_id=buyer,false)) order by r.id desc) from (select * from auction_bids where auction_id=a.id order by id desc limit 20) r),'[]'::jsonb)) data
 from auctions a join specimen_listings l on l.id=a.listing_id
 where ((p_listing is not null and l.id=p_listing and l.published and l.deleted_at is null) or
 (p_listing is null and buyer is not null and exists(select 1 from auction_bids where auction_id=a.id and buyer_id=buyer)))
 order by a.created_at desc limit 100) v;
 return jsonb_build_object('items',result,'server_time',clock_timestamp(),'username',(select username from auction_buyers where id=buyer));
end $$;

create function public.auction_catalog(p_ids uuid[]) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(listing_id,data),'{}'::jsonb) from (
 select distinct on(a.listing_id) a.listing_id,jsonb_build_object('id',a.id,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'current_price',a.current_price,'start_price',a.start_price,'bid_count',a.bid_count) data
 from auctions a join specimen_listings l on l.id=a.listing_id
 where a.listing_id=any(p_ids[1:24]) and l.published and l.deleted_at is null order by a.listing_id,a.created_at desc,a.id
 ) v;
$$;
revoke all on function public.auction_catalog(uuid[]) from public,anon,authenticated;
grant execute on function public.auction_catalog(uuid[]) to anon,authenticated,service_role;

-- Only explicit staff RPCs and server APIs may mutate auction data.
do $$ declare f record; begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('auction_rate','auction_identity','create_auction','settle_auction','settle_due_auctions','cancel_auction','place_auction_bid','read_auctions') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('create_auction','cancel_auction') then execute format('grant execute on function %s to authenticated',f.sig);
 else execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;

commit;
notify pgrst,'reload schema';
