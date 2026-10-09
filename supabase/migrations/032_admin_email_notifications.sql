-- Apply after 031. New successful inserts enqueue mail in the same transaction.
-- Historical bids/receipts are intentionally not replayed.
begin;
create table public.admin_email_outbox (
 id uuid primary key default gen_random_uuid(),
 event_type text not null check(event_type in ('payment_receipt','auction_bid')),
 event_id text not null,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz,
 sent_at timestamptz, last_error text,
 created_at timestamptz not null default now(),
 unique(event_type,event_id,recipient_id)
);
create index admin_email_due on public.admin_email_outbox(available_at,created_at) where status in ('pending','sending');
alter table public.admin_email_outbox enable row level security;
revoke all on public.admin_email_outbox from public,anon,authenticated;

create function public.enqueue_admin_email() returns trigger
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
 else
  kind:='auction_bid';event_key:=new.id::text;
  select jsonb_build_object('auction_id',a.id,'title',l.title,'amount',new.amount,
   'buyer',b.username,'created_at',new.created_at)
  into data from auctions a join specimen_listings l on l.id=a.listing_id
  join auction_buyers b on b.id=new.buyer_id where a.id=new.auction_id;
 end if;
 insert into admin_email_outbox(event_type,event_id,recipient_id,payload)
 select kind,event_key,p.id,data from profiles p join auth.users u on u.id=p.id
 where p.role='admin' and p.active=true and nullif(btrim(u.email),'') is not null
 on conflict(event_type,event_id,recipient_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_admin_email() from public,anon,authenticated;
create trigger payment_receipt_admin_email after insert on public.payment_receipts for each row execute function public.enqueue_admin_email();
create trigger auction_bid_admin_email after insert on public.auction_bids for each row execute function public.enqueue_admin_email();

create function public.claim_admin_emails(p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 -- Recheck membership at delivery time, including after a previous failure.
 update admin_email_outbox o set status='cancelled',lease_token=null,lease_until=null
 where o.status in ('pending','sending') and not exists(
  select 1 from profiles p join auth.users u on u.id=p.id
  where p.id=o.recipient_id and p.role='admin' and p.active=true and nullif(btrim(u.email),'') is not null);
 update admin_email_outbox set status='failed',last_error='RETRY_LIMIT',lease_token=null,lease_until=null
 where status='sending' and lease_until<clock_timestamp() and attempts>=8;
 with due as (
  select o.id from admin_email_outbox o
  where (o.status='pending' and o.available_at<=clock_timestamp()
    or o.status='sending' and o.lease_until<clock_timestamp()) and o.attempts<8
  order by o.available_at,o.created_at,o.id for update skip locked limit greatest(1,least(coalesce(p_limit,5),5))
 ), claimed as (
  update admin_email_outbox o set status='sending',attempts=o.attempts+1,
   lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
  from due where o.id=due.id returning o.*
 ) select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('recipient',u.email)),'[]'::jsonb)
 into result from claimed c join auth.users u on u.id=c.recipient_id;
 return result;
end $$;

create function public.finish_admin_email(p_id uuid,p_lease uuid,p_sent boolean,p_error text default '') returns boolean
language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
 update admin_email_outbox set
  status=case when p_sent then 'sent' when attempts>=8 then 'failed' else 'pending' end,
  sent_at=case when p_sent then clock_timestamp() else null end,
  last_error=case when p_sent then null else left(regexp_replace(coalesce(p_error,'SMTP_ERROR'),'[^A-Z0-9_]','','g'),60) end,
  available_at=clock_timestamp()+make_interval(secs=>least(3600,60*power(2,attempts-1)::integer)),
  lease_token=null,lease_until=null
 where id=p_id and lease_token=p_lease and status='sending';
 get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public.claim_admin_emails(integer),public.finish_admin_email(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_admin_emails(integer),public.finish_admin_email(uuid,uuid,boolean,text) to service_role;
commit;
notify pgrst,'reload schema';
