-- Remove a public listing without destroying animal, photo or sales history.
begin;
alter table public.specimen_listings add column deleted_at timestamptz;
alter table public.specimen_listings add constraint deleted_listing_is_private check(deleted_at is null or not published);
create function public.delete_specimen_listing(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  perform 1 from public.specimen_listings where id=p_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if exists(select 1 from public.purchase_inquiries where listing_id=p_id and status in ('reserved','paid','delivered')) then
    raise exception '请先在意向与销售中处理有效预留、收款或交付，再删除展示档案';
  end if;
  update public.specimen_listings set deleted_at=now(),published=false,
    sale_status=case when sale_status='sold' then 'sold' else 'display' end where id=p_id;
end $$;
revoke all on function public.delete_specimen_listing(uuid) from public,anon;
grant execute on function public.delete_specimen_listing(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
