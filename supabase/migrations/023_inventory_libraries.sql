-- Keep existing stock membership; new homebred animals enter the nursery.
begin;
alter table public.snakes add column inventory_library text not null default 'stock'
  check (inventory_library in ('stock','nursery'));
create table public.inventory_transfers (
  id bigint generated always as identity primary key,
  snake_id text references public.snakes(id) on delete set null,
  individual_id text not null, from_library text not null, to_library text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.inventory_transfers enable row level security;
revoke all on public.inventory_transfers from anon,authenticated;
grant select on public.inventory_transfers to authenticated;
create policy transfer_members on public.inventory_transfers for select to authenticated
using(public.can_edit_app());
create function public.guard_inventory_library() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and new.origin='produced' then new.inventory_library:='nursery'; end if;
  if tg_op='UPDATE' and new.inventory_library is distinct from old.inventory_library
     and current_user in ('authenticated','anon') then raise exception 'Use inventory transfer workflow'; end if;
  return new;
end $$;
create trigger guard_inventory_library before insert or update on public.snakes for each row execute function public.guard_inventory_library();
create function public.transfer_inventory_animal(p_id text,p_target text) returns void
language plpgsql security definer set search_path=public as $$
declare animal public.snakes;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  if p_target is null or p_target not in ('stock','nursery') then raise exception 'Invalid library'; end if;
  select * into animal from public.snakes where id=p_id for update;
  if not found then raise exception 'Animal not found'; end if;
  if animal.inventory_library=p_target then return; end if;
  if animal.status<>'active' then raise exception 'Only active animals can change library'; end if;
  if p_target='nursery' and animal.origin is distinct from 'produced' then raise exception 'Only homebred animals belong in nursery'; end if;
  update public.snakes set inventory_library=p_target where id=p_id;
  insert into public.inventory_transfers(snake_id,individual_id,from_library,to_library,actor_id)
  values(p_id,p_id,animal.inventory_library,p_target,auth.uid());
end $$;
revoke all on function public.transfer_inventory_animal(text,text) from public,anon;
grant execute on function public.transfer_inventory_animal(text,text) to authenticated;
-- Members see only the sales badge, never customer details via this function.
create function public.inventory_sale_states() returns table(snake_id text,sale_state text)
language sql stable security definer set search_path=public as $$
select s.id,case when s.status='sold' then 'sold' when l.sale_status in ('reserved','sold') then l.sale_status
 when l.published and l.sale_status='available' then 'available' else 'normal' end
from public.snakes s left join public.specimen_listings l on l.snake_id=s.id
where exists(select 1 from public.profiles where id=auth.uid() and active);
$$;
revoke all on function public.inventory_sale_states() from public,anon;
grant execute on function public.inventory_sale_states() to authenticated;
commit;
notify pgrst,'reload schema';
