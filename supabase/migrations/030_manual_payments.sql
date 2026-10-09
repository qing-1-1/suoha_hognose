-- QR transfers are never treated as settled by OCR or by a buyer assertion.
-- Apply once after 029, then apply 031 before deploying the current payment UI.
begin;
alter table public.purchase_inquiries add column buyer_id uuid references public.auction_buyers(id);
create index inquiry_buyer on public.purchase_inquiries(buyer_id,created_at desc);
update public.purchase_inquiries i set buyer_id=a.winner_id from public.auctions a where a.inquiry_id=i.id;
create function public.attach_auction_buyer() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.buyer_id is null then select winner_id into new.buyer_id from auctions where id=new.request_id and listing_id=new.listing_id and status='won'; end if;
 return new;
end $$;
create trigger attach_auction_buyer before insert on public.purchase_inquiries for each row execute function public.attach_auction_buyer();

create table public.payment_channels(
 id text primary key check(id in ('wechat','alipay','other')), label text not null check(length(label) between 1 and 60),
 payee text not null check(length(payee) between 1 and 100), instructions text not null default '' check(length(instructions)<=1000),
 qr_path text not null check(qr_path ~ '^qr/[a-f0-9-]+\.jpg$'), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.payment_receipts(
 id uuid primary key, inquiry_id uuid not null references public.purchase_inquiries(id), buyer_id uuid not null references public.auction_buyers(id),
 channel text not null references public.payment_channels(id), channel_snapshot jsonb not null,
 screenshot_path text not null unique, screenshot_sha256 text not null check(screenshot_sha256 ~ '^[a-f0-9]{64}$'),
 ocr_text text not null check(length(ocr_text)<=20000), ocr_fields jsonb not null, ocr_confidence numeric,
 submitted_fields jsonb not null,
 status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text not null default '', confirmed_amount numeric(12,2),
 created_at timestamptz not null default now()
);
create unique index one_active_receipt on public.payment_receipts(inquiry_id) where status in ('pending','confirmed');
create unique index receipt_image_unique on public.payment_receipts(screenshot_sha256) where status in ('pending','confirmed');
create unique index confirmed_transaction_unique on public.payment_receipts(channel,(submitted_fields->>'transaction')) where status='confirmed' and coalesce(submitted_fields->>'transaction','')<>'';
alter table public.payment_channels enable row level security;
alter table public.payment_receipts enable row level security;
revoke all on public.payment_channels,public.payment_receipts from anon,authenticated;
grant select on public.payment_channels,public.payment_receipts to authenticated;
create policy payment_channels_staff on public.payment_channels for select to authenticated using(public.can_edit_app());
create policy payment_receipts_staff on public.payment_receipts for select to authenticated using(public.can_edit_app());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payment-media','payment-media',false,3145728,array['image/jpeg']) on conflict(id) do nothing;
create policy payment_media_staff on storage.objects for select to authenticated using(bucket_id='payment-media' and public.can_edit_app());

create function public.payment_buyer(p_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare b uuid; begin
 select buyer_id into b from auction_sessions where token_hash=p_token and expires_at>clock_timestamp();
 if b is null then raise exception '请先登录买家账号'; end if; return b;
end $$;

create function public.purchase_now(p_token text,p_listing uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare b uuid:=payment_buyer(p_token); l specimen_listings; i purchase_inquiries; person auction_buyers; begin
 select * into l from specimen_listings where id=p_listing for update;
 select * into i from purchase_inquiries where request_id=p_request;
 if i.id is not null then
  if i.buyer_id is distinct from b or i.listing_id<>p_listing then raise exception '请求编号冲突'; end if; return i.id;
 end if;
 select * into i from purchase_inquiries where listing_id=p_listing and buyer_id=b and status='reserved';
 if i.id is not null then return i.id; end if;
 if l.id is null or not l.published or l.deleted_at is not null or l.sale_status<>'available' or l.currency<>'CNY' or coalesce(l.asking_price,0)<=0 then raise exception '该个体目前不可直接购买，请联系店铺'; end if;
 if exists(select 1 from auctions where listing_id=l.id and status='open') then raise exception '此个体正在拍卖'; end if;
 if not exists(select 1 from payment_channels where enabled) then raise exception '店铺尚未配置付款渠道，请先咨询'; end if;
 if (select count(*) from purchase_inquiries where buyer_id=b and status='reserved')>=3 then raise exception '请先处理已有待付款订单'; end if;
 select * into person from auction_buyers where id=b;
 insert into purchase_inquiries(request_id,listing_id,customer_name,contact,message,fingerprint,status,reserved_until,agreed_price,currency,buyer_id)
 values(p_request,l.id,person.username,person.contact,'买家确认购买，等待付款截图及人工核实','buyer:'||b,'reserved',clock_timestamp()+interval '2 hours',l.asking_price,'CNY',b) returning * into i;
 update specimen_listings set sale_status='reserved' where id=l.id;
 insert into sales_activity(inquiry_id,action,note) values(i.id,'purchase_now','买家确认购买，预留两小时；超时须人工核实后取消');
 return i.id;
end $$;

create function public.read_payment_orders(p_token text,p_order uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare b uuid:=payment_buyer(p_token); orders jsonb; begin
 if p_order is not null and not exists(select 1 from purchase_inquiries where id=p_order and buyer_id=b) then raise exception '订单不存在或无权查看'; end if;
 select coalesce(jsonb_agg(v.data order by v.created_at desc),'[]'::jsonb) into orders from (
 select i.created_at,jsonb_build_object('id',i.id,'reference',i.reference,'title',l.title,'status',i.status,'amount',i.agreed_price,'currency',i.currency,'reserved_until',i.reserved_until,
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'note',r.review_note,'fields',r.submitted_fields) order by r.created_at desc) from payment_receipts r where r.inquiry_id=i.id),'[]'::jsonb)) data
 from purchase_inquiries i join specimen_listings l on l.id=i.listing_id where i.buyer_id=b and (p_order is null or i.id=p_order) order by i.created_at desc limit 100) v;
 return jsonb_build_object('buyer_id',b,'orders',orders,'channels',case when p_order is not null then coalesce((select jsonb_agg(to_jsonb(c)) from payment_channels c where enabled),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create function public.submit_payment_receipt(p_token text,p_id uuid,p_order uuid,p_channel text,p_hash text,p_ocr text,p_ocr_fields jsonb,p_confidence numeric,p_fields jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare b uuid:=payment_buyer(p_token); i purchase_inquiries; r payment_receipts; c payment_channels; begin
 perform 1 from specimen_listings where id=(select listing_id from purchase_inquiries where id=p_order) for update;
 select * into i from purchase_inquiries where id=p_order for update;
 if i.id is null or i.buyer_id is distinct from b then raise exception '订单不存在或无权查看'; end if;
 select * into r from payment_receipts where id=p_id;
 if r.id is not null then
  if r.buyer_id<>b or r.inquiry_id<>i.id or r.screenshot_sha256<>p_hash or r.channel<>p_channel or r.submitted_fields<>p_fields then raise exception '提交编号冲突'; end if; return r.id;
 end if;
 if i.status<>'reserved' or i.currency<>'CNY' then raise exception '订单当前不能提交付款截图'; end if;
 if exists(select 1 from payment_receipts where inquiry_id=i.id and status in ('pending','confirmed')) then raise exception '已有付款记录待核实，请勿重复付款'; end if;
 if exists(select 1 from payment_receipts where screenshot_sha256=p_hash and status in ('pending','confirmed')) then raise exception '该截图已用于其他付款记录，请联系店铺'; end if;
 select * into c from payment_channels where id=p_channel;
 -- Disabled channels still accept evidence of a transfer already made.
 if c.id is null then raise exception '收款方式不存在'; end if;
 if jsonb_typeof(p_fields)<>'object' or jsonb_typeof(p_ocr_fields)<>'object' or length(p_fields::text)>4000 or length(p_ocr_fields::text)>4000 or p_confidence not between 0 and 100 then raise exception '付款信息格式错误'; end if;
 insert into payment_receipts(id,inquiry_id,buyer_id,channel,channel_snapshot,screenshot_path,screenshot_sha256,ocr_text,ocr_fields,ocr_confidence,submitted_fields)
 values(p_id,i.id,b,c.id,to_jsonb(c),'receipts/'||b||'/'||p_id||'-'||p_hash||'.jpg',p_hash,p_ocr,p_ocr_fields,p_confidence,p_fields);
 insert into sales_activity(inquiry_id,action,note) values(i.id,'receipt_submitted','已提交付款截图，等待人工确认到账');
 return p_id;
end $$;

create function public.save_payment_channel(p_id text,p_label text,p_payee text,p_instructions text,p_path text,p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not can_edit_app() then raise exception 'Not authorized'; end if;
 insert into payment_channels(id,label,payee,instructions,qr_path,enabled) values(p_id,btrim(p_label),btrim(p_payee),p_instructions,p_path,p_enabled)
 on conflict(id) do update set label=excluded.label,payee=excluded.payee,instructions=excluded.instructions,qr_path=excluded.qr_path,enabled=excluded.enabled,updated_at=clock_timestamp();
end $$;

create function public.review_payment_receipt(p_id uuid,p_decision text,p_note text,p_amount numeric,p_verified boolean) returns void language plpgsql security definer set search_path=public as $$
declare r payment_receipts; i purchase_inquiries; begin
 if not can_edit_app() then raise exception 'Not authorized'; end if;
 select * into r from payment_receipts where id=p_id;
 perform 1 from specimen_listings where id=(select listing_id from purchase_inquiries where id=r.inquiry_id) for update;
 select * into i from purchase_inquiries where id=r.inquiry_id for update;
 select * into r from payment_receipts where id=p_id for update;
 if r.id is null or p_decision not in ('confirmed','rejected') or p_decision is null then raise exception '无效审核操作'; end if;
 if r.status=p_decision then return; end if;
 if r.status<>'pending' then raise exception '该记录已审核，请刷新'; end if;
 if p_decision='confirmed' then
  if p_verified is distinct from true or p_amount is null or p_amount is distinct from i.agreed_price or i.status<>'reserved' then raise exception '请在真实收款账户核实足额到账，确认金额须与订单一致'; end if;
  if exists(select 1 from payment_receipts where status='confirmed' and channel=r.channel and nullif(submitted_fields->>'transaction','')=nullif(r.submitted_fields->>'transaction','')) then raise exception '交易单号已用于其他订单，请核实'; end if;
 elsif length(btrim(coalesce(p_note,'')))=0 then raise exception '请填写退回原因'; end if;
 update payment_receipts set status=p_decision,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=left(coalesce(p_note,''),1500),confirmed_amount=case when p_decision='confirmed' then p_amount end where id=p_id;
 if p_decision='confirmed' then update purchase_inquiries set status='paid',paid_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id; end if;
 insert into sales_activity(inquiry_id,actor_id,action,note) values(i.id,auth.uid(),'receipt_'||p_decision,left(coalesce(p_note,''),1500));
end $$;

create function public.guard_pending_receipt() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.status is distinct from old.status or new.agreed_price is distinct from old.agreed_price or new.currency is distinct from old.currency) and exists(select 1 from payment_receipts where inquiry_id=old.id and status='pending') then raise exception '存在待核实付款截图，请先在收款审核中处理'; end if; return new;
end $$;
create trigger pending_receipt_guard before update on public.purchase_inquiries for each row execute function public.guard_pending_receipt();
do $$ declare f record; begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('payment_buyer','purchase_now','read_payment_orders','submit_payment_receipt','save_payment_channel','review_payment_receipt') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('save_payment_channel','review_payment_receipt') then execute format('grant execute on function %s to authenticated',f.sig);
 else execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;

commit;
notify pgrst,'reload schema';
