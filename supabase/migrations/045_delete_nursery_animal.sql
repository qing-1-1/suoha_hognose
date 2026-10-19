-- Delete mistaken offspring entries atomically; retain linked business history.
begin;
create function public.delete_nursery_animal(p_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare animal public.snakes;paths jsonb;
begin
 if public.can_edit_app() is not true then raise exception 'Not authorized';end if;
 perform 1 from public.room_workspace where id=1 for update;
 select * into animal from public.snakes where id=p_id for update;
 if not found then raise exception '个体已不存在，请刷新';end if;
 if animal.inventory_library is distinct from 'nursery' and animal.origin is distinct from 'produced' then raise exception '仅可从子代库删除自繁个体';end if;
 if exists(select 1 from public.room_assignments where snake_id=p_id) then raise exception '请先将蛇只移出爬柜或冬化箱，再删除档案';end if;
 if exists(select 1 from public.snakes where dam_id=p_id or sire_id=p_id)
 or exists(select 1 from public.annual_breeding_plans where female_snake_id=p_id or male_snake_id=p_id)
 or exists(select 1 from public.breeding_events where female_snake_id=p_id or male_snake_id=p_id)
 or exists(select 1 from public.clutches where female_snake_id=p_id or male_snake_id=p_id)
 or exists(select 1 from public.route_nodes where snake_id=p_id)
 then raise exception '该个体已有亲本、繁育计划或路线引用，请先处理关联记录';end if;
 perform 1 from public.specimen_listings where snake_id=p_id for update;
 if exists(select 1 from public.specimen_listings where snake_id=p_id and (published or sale_status<>'display')) then raise exception '该个体正在展示／销售，请先下架并处理交易记录';end if;
 if exists(select 1 from public.room_feeding_records where snake_id=p_id)
 or exists(select 1 from public.room_location_history where snake_id=p_id)
 then raise exception '该个体已有爬房历史，不能删除；可改为退役保留记录';end if;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from (
 select distinct unnest(array[m.storage_path,m.thumbnail_path,m.original_path]) path from public.specimen_media m join public.specimen_listings l on l.id=m.listing_id where l.snake_id=p_id
 ) files where path is not null;
 -- Unpublished photo-only drafts may be removed. Inquiry/auction foreign keys
 -- reject linked transactions and roll back the entire deletion.
 delete from public.specimen_media where listing_id in (select id from public.specimen_listings where snake_id=p_id);
 delete from public.specimen_listings where snake_id=p_id;
 delete from public.snake_genes where snake_id=p_id;
 delete from public.snake_measurements where snake_id=p_id;
 delete from public.snakes where id=p_id;
 return jsonb_build_object('removed_paths',paths);
exception when foreign_key_violation then
 raise exception '该个体仍有关联业务记录，删除已取消，原档案完整保留';
end $$;
revoke all on function public.delete_nursery_animal(text) from public,anon;
grant execute on function public.delete_nursery_animal(text) to authenticated;
commit;
notify pgrst,'reload schema';
