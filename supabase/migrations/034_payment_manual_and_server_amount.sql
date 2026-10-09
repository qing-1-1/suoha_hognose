-- Apply after 033. Manual payment details may be submitted without a screenshot.
begin;
alter table public.payment_receipts alter column screenshot_path drop not null;
alter table public.payment_receipts alter column screenshot_sha256 drop not null;
alter table public.payment_receipts add column recognized_amount numeric(12,2);
alter table public.payment_receipts add column amount_ocr_status text not null default 'legacy'
 check(amount_ocr_status in ('legacy','no_image','recognized','not_detected','failed'));
alter table public.payment_receipts add constraint receipt_amount_evidence check(
 (amount_ocr_status='recognized' and recognized_amount is not null and recognized_amount>0)
 or (amount_ocr_status<>'recognized' and recognized_amount is null));
alter table public.payment_receipts add constraint receipt_image_pair check((screenshot_path is null)=(screenshot_sha256 is null));

create function public.submit_payment_receipt_v2(p_token text,p_id uuid,p_order uuid,p_channel text,p_hash text,
 p_fields jsonb,p_amount numeric,p_amount_status text,p_ocr text,p_confidence numeric) returns uuid
language plpgsql security definer set search_path=public as $$
declare b uuid:=payment_buyer(p_token); i purchase_inquiries; r payment_receipts; c payment_channels; clean jsonb;
begin
 if jsonb_typeof(p_fields) is distinct from 'object' or length(p_fields::text)>4000 then raise exception '付款信息格式错误'; end if;
 clean:=jsonb_build_object('transaction',btrim(coalesce(p_fields->>'transaction','')),'time',coalesce(p_fields->>'time',''),'payee',coalesce(p_fields->>'payee',''));
 if length(clean->>'transaction') not between 1 and 100 or length(clean->>'time')>200 or length(clean->>'payee')>200 then raise exception '请填写支付单号，并检查付款信息长度'; end if;
 if p_amount_status is null or p_amount_status not in ('no_image','recognized','not_detected','failed')
  or (p_hash is null) is distinct from (p_amount_status='no_image')
  or p_confidence not between 0 and 100 then raise exception '识别信息格式错误'; end if;
 perform 1 from specimen_listings where id=(select listing_id from purchase_inquiries where id=p_order) for update;
 select * into i from purchase_inquiries where id=p_order for update;
 if i.id is null or i.buyer_id is distinct from b then raise exception '订单不存在或无权查看'; end if;
 select * into r from payment_receipts where id=p_id;
 if r.id is not null then
  if r.buyer_id<>b or r.inquiry_id<>i.id or r.screenshot_sha256 is distinct from p_hash or r.channel<>p_channel or r.submitted_fields<>clean then raise exception '提交编号冲突'; end if;
  return r.id;
 end if;
 if i.status<>'reserved' or i.currency<>'CNY' then raise exception '订单当前不能提交付款信息'; end if;
 if exists(select 1 from payment_receipts where inquiry_id=i.id and status in ('pending','confirmed')) then raise exception '已有付款记录待核实，请勿重复付款'; end if;
 if p_hash is not null and exists(select 1 from payment_receipts where screenshot_sha256=p_hash and status in ('pending','confirmed')) then raise exception '该截图已用于其他付款记录，请联系店铺'; end if;
 select * into c from payment_channels where id=p_channel;
 if c.id is null then raise exception '收款方式不存在'; end if;
 insert into payment_receipts(id,inquiry_id,buyer_id,channel,channel_snapshot,screenshot_path,screenshot_sha256,ocr_text,ocr_fields,ocr_confidence,submitted_fields,recognized_amount,amount_ocr_status)
 values(p_id,i.id,b,c.id,to_jsonb(c),case when p_hash is not null then 'receipts/'||b||'/'||p_id||'-'||p_hash||'.jpg' end,p_hash,
  left(coalesce(p_ocr,''),20000),jsonb_build_object('amount',p_amount,'source','server'),p_confidence,clean,p_amount,p_amount_status);
 insert into sales_activity(inquiry_id,action,note) values(i.id,'receipt_submitted','已提交付款信息，等待人工确认到账');
 return p_id;
end $$;
revoke all on function public.submit_payment_receipt_v2(text,uuid,uuid,text,text,jsonb,numeric,text,text,numeric) from public,anon,authenticated;
grant execute on function public.submit_payment_receipt_v2(text,uuid,uuid,text,text,jsonb,numeric,text,text,numeric) to service_role;
-- Prevent old endpoints from accepting buyer-controlled amount/OCR values.
revoke all on function public.submit_payment_receipt(text,uuid,uuid,text,text,text,jsonb,numeric,jsonb) from service_role;

create or replace function public.enqueue_admin_email() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text; event_key text; data jsonb;
begin
 if tg_table_name='payment_receipts' then
  kind:='payment_receipt';event_key:=new.id::text;
  select jsonb_build_object('reference',i.reference,'title',l.title,'amount',i.agreed_price,
   'recognized_amount',new.recognized_amount,'amount_ocr_status',new.amount_ocr_status,'channel',new.channel,'buyer',b.username,'created_at',new.created_at)
  into data from purchase_inquiries i join specimen_listings l on l.id=i.listing_id
  join auction_buyers b on b.id=new.buyer_id where i.id=new.inquiry_id;
 elsif tg_table_name='auctions' then
  if new.status<>'won' or new.winner_id is null or new.inquiry_id is null then return new; end if;
  kind:='auction_won';event_key:=new.id::text;
  select jsonb_build_object('auction_id',new.id,'reference',i.reference,'title',l.title,'amount',new.current_price,'buyer',b.username,'created_at',clock_timestamp())
  into data from specimen_listings l join auction_buyers b on b.id=new.winner_id
  join purchase_inquiries i on i.id=new.inquiry_id where l.id=new.listing_id;
 else return new; end if;
 insert into admin_email_outbox(event_type,event_id,recipient_id,payload)
 select kind,event_key,p.id,data from profiles p join auth.users u on u.id=p.id
 where p.role='admin' and p.active=true and nullif(btrim(u.email),'') is not null
 on conflict(event_type,event_id,recipient_id) do nothing;
 return new;
end $$;
commit;
notify pgrst,'reload schema';
