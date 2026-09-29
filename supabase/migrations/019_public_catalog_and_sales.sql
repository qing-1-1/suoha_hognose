-- Additive public catalog. Run AFTER 005–018 and the original business schema.
-- Existing animals remain private: no automatic publications or seed imports.
begin;

create table if not exists public.specimen_listings (
  id uuid primary key default gen_random_uuid(),
  snake_id text not null unique references public.snakes(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text not null check (length(btrim(title)) between 1 and 150),
  description text not null default '' check (length(description) <= 4000),
  published boolean not null default false,
  featured boolean not null default false,
  sale_status text not null default 'display' check (sale_status in ('display','available','reserved','sold')),
  asking_price numeric(12,2) check (asking_price >= 0),
  currency text not null default 'CNY' check (currency in ('CNY','USD','EUR','GBP','JPY')),
  birth_precision text not null default 'month' check (birth_precision in ('year','month','day','unknown')),
  husbandry_summary text not null default '' check (length(husbandry_summary) <= 1000),
  pedigree_summary text not null default '' check (length(pedigree_summary) <= 1000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.specimen_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.specimen_listings(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (length(caption) <= 200),
  sort_order integer not null default 0,
  photographed_at date,
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_inquiries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  listing_id uuid not null references public.specimen_listings(id) on delete restrict,
  reference text not null unique default ('SH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  customer_name text not null check (length(btrim(customer_name)) between 1 and 80),
  contact text not null check (length(btrim(contact)) between 3 and 200),
  message text not null default '' check (length(message) <= 1500),
  fingerprint text not null,
  status text not null default 'new' check (status in ('new','contacted','reserved','paid','delivered','completed','cancelled')),
  reserved_until timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  agreed_price numeric(12,2) check (agreed_price >= 0),
  currency text not null default 'CNY' check (currency in ('CNY','USD','EUR','GBP','JPY')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_specimen_reservation on public.purchase_inquiries(listing_id)
  where status in ('reserved','paid','delivered','completed');
create index if not exists inquiry_rate_window on public.purchase_inquiries(fingerprint,created_at);
create table if not exists public.sales_activity (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.purchase_inquiries(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.specimen_listings enable row level security;
alter table public.specimen_media enable row level security;
alter table public.purchase_inquiries enable row level security;
alter table public.sales_activity enable row level security;
revoke all on public.specimen_listings,public.specimen_media,public.purchase_inquiries,public.sales_activity from anon,authenticated;
grant select,insert,update on public.specimen_listings to authenticated;
grant select,insert,update,delete on public.specimen_media to authenticated;
grant select on public.purchase_inquiries,public.sales_activity to authenticated;
create policy listing_editors on public.specimen_listings for all to authenticated using(public.can_edit_app()) with check(public.can_edit_app());
create policy media_editors on public.specimen_media for all to authenticated using(public.can_edit_app()) with check(public.can_edit_app());
create policy inquiries_editors on public.purchase_inquiries for select to authenticated using(public.can_edit_app());
create policy activity_editors on public.sales_activity for select to authenticated using(public.can_edit_app());

-- Staff cannot bypass the transactional reservation workflow by editing a listing.
create or replace function public.guard_listing_status() returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' and new.sale_status in ('reserved','sold') then raise exception 'Use sales workflow'; end if;
    if tg_op='UPDATE' and new.sale_status is distinct from old.sale_status and
       (old.sale_status in ('reserved','sold') or new.sale_status in ('reserved','sold')) then raise exception 'Use sales workflow'; end if;
    if tg_op='UPDATE' and (new.snake_id is distinct from old.snake_id or new.id is distinct from old.id) then raise exception 'Listing identity cannot change'; end if;
  end if;
  if new.sale_status='available' and not exists(select 1 from public.snakes where id=new.snake_id and status='active') then
    raise exception 'Only active animals may be offered';
  end if;
  new.updated_at=now();
  return new;
end $$;
create trigger guard_listing_status before insert or update on public.specimen_listings for each row execute function public.guard_listing_status();

-- A manual lifecycle edit must not leave an animal offered or reserved.
-- The sale RPC changes the listing to sold before changing the animal.
create or replace function public.guard_listed_snake_lifecycle() returns trigger
language plpgsql security definer set search_path=public as $$
declare listing_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select sale_status into listing_status from public.specimen_listings where snake_id=old.id for update;
  if listing_status in ('available','reserved') and new.status is distinct from 'active' then
    raise exception 'Resolve availability or reservation before changing animal status';
  end if;
  if listing_status='sold' and new.status is distinct from 'sold' then
    raise exception 'Completed sale requires a separate correction workflow';
  end if;
  return new;
end $$;
create trigger guard_listed_snake_lifecycle before update of status on public.snakes
for each row execute function public.guard_listed_snake_lifecycle();

-- SECURITY DEFINER is intentional: ONLY the explicit projection below is public.
create or replace function public.public_catalog(p_slug text default null, p_page integer default 1,
  p_search text default '', p_series text default '', p_sex text default '', p_status text default '', p_sort text default 'newest')
returns jsonb language sql stable security definer set search_path=public as $$
with eligible as (
  select l.*,s.series,s.sex,s.birth_date,s.gene_text from public.specimen_listings l join public.snakes s on s.id=l.snake_id
  where l.published and (p_slug is null or l.slug=p_slug)
    and (p_series='' or s.series=p_series) and (p_sex='' or s.sex=p_sex) and (p_status='' or l.sale_status=p_status)
    and (p_search='' or l.title ilike '%'||left(p_search,100)||'%' or s.id ilike '%'||left(p_search,100)||'%'
      or s.gene_text ilike '%'||left(p_search,100)||'%')
), page as (
  select * from eligible order by
    case when p_sort='price_asc' then asking_price end asc nulls last,
    case when p_sort='price_desc' then asking_price end desc nulls last,
    featured desc,created_at desc,id
  limit 24 offset ((greatest(1,least(coalesce(p_page,1),10000))-1)*24)
)
select jsonb_build_object('total',(select count(*) from eligible),'page',greatest(1,coalesce(p_page,1)),
 'series',coalesce((select jsonb_agg(v.series order by v.series) from (select distinct s.series from public.specimen_listings l join public.snakes s on s.id=l.snake_id where l.published and s.series is not null) v),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'slug',p.slug,'snake_id',p.snake_id,'title',p.title,'description',p.description,
   'series',p.series,'sex',p.sex,'birth',case p.birth_precision when 'day' then to_char(p.birth_date,'YYYY-MM-DD') when 'month' then to_char(p.birth_date,'YYYY-MM') when 'year' then to_char(p.birth_date,'YYYY') else null end,
   'gene_text',p.gene_text,'sale_status',p.sale_status,'asking_price',p.asking_price,'currency',p.currency,'featured',p.featured,
   'husbandry_summary',p.husbandry_summary,'pedigree_summary',p.pedigree_summary,
   'genes',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name_zh,'state',sg.state,'probability',sg.probability) order by g.id) from public.snake_genes sg join public.genes g on g.id=sg.gene_id where sg.snake_id=p.snake_id),'[]'::jsonb),
   'photos',coalesce((select jsonb_agg(jsonb_build_object('path',m.storage_path,'caption',m.caption,'date',m.photographed_at) order by m.sort_order,m.created_at) from public.specimen_media m where m.listing_id=p.id),'[]'::jsonb)
 )) from page p),'[]'::jsonb));
$$;
revoke all on function public.public_catalog(text,integer,text,text,text,text,text) from public;
grant execute on function public.public_catalog(text,integer,text,text,text,text,text) to anon,authenticated,service_role;

create or replace function public.submit_purchase_inquiry(p_request_id uuid,p_listing_id uuid,p_name text,p_contact text,p_message text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing public.purchase_inquiries; result public.purchase_inquiries;
begin
  -- Serializes retries and rate checks for this server-HMAC fingerprint.
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
  select * into existing from public.purchase_inquiries where request_id=p_request_id;
  if found then
    if existing.fingerprint<>p_fingerprint or existing.listing_id<>p_listing_id or existing.contact<>btrim(p_contact) then raise exception 'Request conflict'; end if;
    return jsonb_build_object('reference',existing.reference);
  end if;
  if (select count(*) from public.purchase_inquiries where fingerprint=p_fingerprint and created_at>now()-interval '1 hour')>=5 then raise exception 'Rate limit exceeded'; end if;
  perform 1 from public.specimen_listings where id=p_listing_id and published and sale_status in ('available','reserved') for update;
  if not found then raise exception 'This specimen is not accepting inquiries'; end if;
  insert into public.purchase_inquiries(request_id,listing_id,customer_name,contact,message,fingerprint)
  values(p_request_id,p_listing_id,btrim(p_name),btrim(p_contact),coalesce(p_message,''),p_fingerprint) returning * into result;
  return jsonb_build_object('reference',result.reference);
end $$;
revoke all on function public.submit_purchase_inquiry(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_purchase_inquiry(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.manage_specimen_sale(p_id uuid,p_action text,p_note text default '',p_until timestamptz default null,p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inquiry public.purchase_inquiries; listing public.specimen_listings; target text;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  select * into inquiry from public.purchase_inquiries where id=p_id;
  if not found then raise exception 'Inquiry not found'; end if;
  select * into listing from public.specimen_listings where id=inquiry.listing_id for update;
  select * into inquiry from public.purchase_inquiries where id=p_id for update;
  if p_action='contact' and inquiry.status='new' then target:='contacted';
  elsif p_action='reserve' and inquiry.status in ('new','contacted') then
    if listing.sale_status<>'available' then raise exception 'Specimen is not available'; end if;
    if p_until is null or p_until<=now() then raise exception 'Choose a future reservation expiry'; end if;
    if p_amount is null or p_amount<0 then raise exception 'Confirm the agreed price'; end if;
    target:='reserved';
    update public.specimen_listings set sale_status='reserved' where id=listing.id;
    update public.purchase_inquiries set reserved_until=p_until,agreed_price=p_amount,currency=listing.currency where id=p_id;
  elsif p_action='paid' and inquiry.status='reserved' then
    target:='paid'; update public.purchase_inquiries set paid_at=now() where id=p_id;
  elsif p_action='deliver' and inquiry.status='paid' then
    target:='delivered'; update public.purchase_inquiries set delivered_at=now() where id=p_id;
  elsif p_action='complete' and inquiry.status='delivered' then
    target:='completed';
    update public.specimen_listings set sale_status='sold' where id=listing.id;
    update public.snakes set status='sold' where id=listing.snake_id;
  elsif p_action='cancel' and inquiry.status in ('new','contacted','reserved') then
    if length(btrim(p_note))=0 then raise exception 'Cancellation reason required'; end if;
    target:='cancelled';
    if inquiry.status='reserved' then update public.specimen_listings set sale_status='display' where id=listing.id; end if;
  else raise exception 'Invalid transition; refresh to see the latest state'; end if;
  update public.purchase_inquiries set status=target,updated_at=now() where id=p_id;
  insert into public.sales_activity(inquiry_id,actor_id,action,note) values(p_id,auth.uid(),p_action,left(p_note,1500));
  return jsonb_build_object('status',target);
end $$;
revoke all on function public.manage_specimen_sale(uuid,text,text,timestamptz,numeric) from public,anon;
grant execute on function public.manage_specimen_sale(uuid,text,text,timestamptz,numeric) to authenticated;

-- Publication media is a separate private bucket. Only media of a currently
-- published listing can be fetched anonymously. Unpublishing revokes access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('specimen-media','specimen-media',false,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy specimen_media_staff on storage.objects for all to authenticated
using(bucket_id='specimen-media' and public.can_edit_app()) with check(bucket_id='specimen-media' and public.can_edit_app());
create or replace function public.is_published_specimen_media(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.specimen_media m join public.specimen_listings l on l.id=m.listing_id where m.storage_path=p_path and l.published);
$$;
revoke all on function public.is_published_specimen_media(text) from public;
grant execute on function public.is_published_specimen_media(text) to anon,authenticated;
create policy specimen_media_public on storage.objects for select to anon,authenticated
using(bucket_id='specimen-media' and public.is_published_specimen_media(name));

commit;
notify pgrst,'reload schema';
