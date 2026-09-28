-- Aliases for named morph combinations.
-- Run in Supabase SQL Editor after morphs and morph_components exist.

begin;

create table if not exists public.morph_aliases (
  alias text primary key check (length(btrim(alias)) > 0),
  morph_id text not null references public.morphs(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_morph_aliases_alias_lower
  on public.morph_aliases (lower(alias));

create index if not exists idx_morph_aliases_morph_id
  on public.morph_aliases(morph_id);

grant select, insert, update, delete on public.morph_aliases to authenticated;

alter table public.morph_aliases enable row level security;

drop policy if exists "morph_aliases_select_active_users" on public.morph_aliases;
create policy "morph_aliases_select_active_users"
on public.morph_aliases
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

drop policy if exists "morph_aliases_insert_editors" on public.morph_aliases;
create policy "morph_aliases_insert_editors"
on public.morph_aliases
for insert
to authenticated
with check (public.can_edit_app());

drop policy if exists "morph_aliases_update_editors" on public.morph_aliases;
create policy "morph_aliases_update_editors"
on public.morph_aliases
for update
to authenticated
using (public.can_edit_app())
with check (public.can_edit_app());

drop policy if exists "morph_aliases_delete_editors" on public.morph_aliases;
create policy "morph_aliases_delete_editors"
on public.morph_aliases
for delete
to authenticated
using (public.can_edit_app());

commit;

notify pgrst, 'reload schema';
