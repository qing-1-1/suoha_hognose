-- Read-only: run in the Supabase SQL editor for the affected production project.
-- No emails are sent, no queue records are claimed, and no private values are returned.
select to_regclass('public.admin_email_outbox') is not null as email_queue_exists;

select t.tgname as trigger_name,t.tgenabled as enabled
from pg_trigger t
where t.tgrelid=to_regclass('public.payment_receipts') and not t.tgisinternal;

select count(*) as active_admins,
 count(*) filter(where nullif(btrim(u.email),'') is not null) as email_recipients
from public.profiles p join auth.users u on u.id=p.id
where p.role='admin' and p.active=true;

-- If email_queue_exists is false, apply 032 then 033 (and 034 for the current code)
-- before running the remaining queries.
select event_type,status,count(*) as total,max(created_at) as latest_created,
 max(sent_at) as latest_sent,max(attempts) as max_attempts,last_error
from public.admin_email_outbox
where created_at>now()-interval '7 days'
group by event_type,status,last_error order by latest_created desc;

select count(*) as recent_receipts,
 count(*) filter(where not exists(select 1 from public.admin_email_outbox o
  where o.event_type='payment_receipt' and o.event_id=r.id::text)) as receipts_without_notifications
from public.payment_receipts r where r.created_at>now()-interval '1 day';
