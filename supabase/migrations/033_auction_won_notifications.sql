-- Apply after 032, before enabling/deploying the mail worker.
-- Notify administrators once per completed auction, never per bid.
begin;
drop trigger if exists auction_bid_admin_email on public.auction_bids;
update public.admin_email_outbox set status='cancelled',lease_token=null,lease_until=null
where event_type='auction_bid' and status in ('pending','sending','failed');
alter table public.admin_email_outbox drop constraint admin_email_outbox_event_type_check;
-- Retain the legacy type for historical sent/cancelled records only.
alter table public.admin_email_outbox add constraint admin_email_outbox_event_type_check
 check(event_type in ('payment_receipt','auction_bid','auction_won'));

create or replace function public.enqueue_admin_email() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text; event_key text; data jsonb;
begin
 if tg_table_name='payment_receipts' then
  kind:='payment_receipt';event_key:=new.id::text;
  select jsonb_build_object('reference',i.reference,'title',l.title,'amount',i.agreed_price,
   'submitted_amount',new.submitted_fields->>'amount','channel',new.channel,'buyer',b.username,
   'created_at',new.created_at)
  into data from purchase_inquiries i join specimen_listings l on l.id=i.listing_id
  join auction_buyers b on b.id=new.buyer_id where i.id=new.inquiry_id;
 elsif tg_table_name='auctions' then
  if new.status<>'won' or new.winner_id is null or new.inquiry_id is null then return new; end if;
  kind:='auction_won';event_key:=new.id::text;
  select jsonb_build_object('auction_id',new.id,'reference',i.reference,'title',l.title,
   'amount',new.current_price,'buyer',b.username,'created_at',clock_timestamp())
  into data from specimen_listings l join auction_buyers b on b.id=new.winner_id
  join purchase_inquiries i on i.id=new.inquiry_id where l.id=new.listing_id;
 else
  return new;
 end if;
 insert into admin_email_outbox(event_type,event_id,recipient_id,payload)
 select kind,event_key,p.id,data from profiles p join auth.users u on u.id=p.id
 where p.role='admin' and p.active=true and nullif(btrim(u.email),'') is not null
 on conflict(event_type,event_id,recipient_id) do nothing;
 return new;
end $$;
-- Settlement first sets status=won, then creates the order and links inquiry_id.
-- Wait for both so every email contains a complete, committed sale reference.
create trigger auction_won_admin_email after update of status,inquiry_id on public.auctions
for each row when (new.status='won' and new.winner_id is not null and new.inquiry_id is not null
 and (old.status is distinct from 'won' or old.inquiry_id is null))
execute function public.enqueue_admin_email();
commit;
notify pgrst,'reload schema';
