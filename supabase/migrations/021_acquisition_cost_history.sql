-- Preserve recorded acquisition costs when animals leave the inventory.
-- These are cost snapshots, not fabricated dated payments or accounting entries.
begin;
create table if not exists public.snake_acquisition_costs (
  id uuid primary key default gen_random_uuid(),
  snake_id text unique references public.snakes(id) on delete set null,
  individual_id text not null,
  gene_text text,
  investor text,
  amount numeric(12,2) not null check(amount>=0),
  updated_at timestamptz not null default now()
);
alter table public.snake_acquisition_costs enable row level security;
revoke all on public.snake_acquisition_costs from anon,authenticated;
grant select on public.snake_acquisition_costs to authenticated;
create policy acquisition_read_members on public.snake_acquisition_costs for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and active));

insert into public.snake_acquisition_costs(snake_id,individual_id,gene_text,investor,amount)
select id,id,gene_text,investor,coalesce(price,0) from public.snakes
on conflict(snake_id) do nothing;
create or replace function public.capture_acquisition_cost() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.snake_acquisition_costs(snake_id,individual_id,gene_text,investor,amount)
  values(new.id,new.id,new.gene_text,new.investor,coalesce(new.price,0))
  on conflict(snake_id) do update set gene_text=excluded.gene_text,investor=excluded.investor,amount=excluded.amount,updated_at=now();
  return new;
end $$;
create trigger capture_acquisition_cost after insert or update of price,investor,gene_text on public.snakes
for each row execute function public.capture_acquisition_cost();

alter table public.investment_expenses add column if not exists acquisition_id uuid references public.snake_acquisition_costs(id) on delete restrict;
create unique index if not exists one_expense_per_acquisition on public.investment_expenses(acquisition_id) where acquisition_id is not null;
create or replace function public.guard_expense_acquisition() returns trigger
language plpgsql security definer set search_path=public as $$
declare acquisition public.snake_acquisition_costs; profile public.profiles;
begin
  if new.acquisition_id is null then return new; end if;
  if new.category<>'population' then raise exception 'Acquisition links require population category'; end if;
  select * into acquisition from public.snake_acquisition_costs where id=new.acquisition_id;
  if not found then raise exception 'Acquisition not found'; end if;
  select * into profile from public.profiles where id=auth.uid() and active;
  if profile.id is null then raise exception 'Not authorized'; end if;
  if not public.can_edit_app() and not (
    lower(coalesce(acquisition.investor,'')) in (lower(coalesce(profile.email,'')),lower(coalesce(profile.display_name,'')))
    or (acquisition.investor is null and left(acquisition.individual_id,1)='M' and lower(profile.email)='1442399241@qq.com')
    or (acquisition.investor is null and left(acquisition.individual_id,1)='Y' and lower(profile.email)='569850649@qq.com')
  ) then raise exception 'Only owner or editor may link this acquisition'; end if;
  return new;
end $$;
create trigger guard_expense_acquisition before insert or update on public.investment_expenses
for each row execute function public.guard_expense_acquisition();
commit;
notify pgrst,'reload schema';
