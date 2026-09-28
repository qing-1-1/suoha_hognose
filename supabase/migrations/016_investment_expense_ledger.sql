-- User-owned investment expense ledger.
-- Run in Supabase SQL Editor after the existing auth/profile/RLS migrations.

begin;

create table if not exists public.investment_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email text,
  owner_name text,
  category text not null check (category in ('population', 'equipment', 'consumables')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null check (length(btrim(note)) > 0),
  spent_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_investment_expenses_owner_id
  on public.investment_expenses(owner_id);

create index if not exists idx_investment_expenses_category
  on public.investment_expenses(category);

create index if not exists idx_investment_expenses_spent_at
  on public.investment_expenses(spent_at desc);

grant select, insert, update, delete on public.investment_expenses to authenticated;

alter table public.investment_expenses enable row level security;

drop policy if exists "investment_expenses_select_active_users" on public.investment_expenses;
create policy "investment_expenses_select_active_users"
on public.investment_expenses
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
);

drop policy if exists "investment_expenses_insert_own_active" on public.investment_expenses;
create policy "investment_expenses_insert_own_active"
on public.investment_expenses
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
);

drop policy if exists "investment_expenses_update_own_or_editor" on public.investment_expenses;
create policy "investment_expenses_update_own_or_editor"
on public.investment_expenses
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
  and (owner_id = auth.uid() or public.can_edit_app())
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
  and (owner_id = auth.uid() or public.can_edit_app())
);

drop policy if exists "investment_expenses_delete_own_or_editor" on public.investment_expenses;
create policy "investment_expenses_delete_own_or_editor"
on public.investment_expenses
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  )
  and (owner_id = auth.uid() or public.can_edit_app())
);

commit;

notify pgrst, 'reload schema';
