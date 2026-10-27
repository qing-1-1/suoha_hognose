-- Run after 053 (or a complete 042 installation). Do not rerun 042.
-- Preserve all records; prevent unresolved, non-batch meals entering brumation.
begin;
do $$
begin
 if to_regprocedure('public.room_check_snake_location()') is null
 or not exists(select 1 from pg_trigger
  where tgrelid=to_regclass('public.room_assignments')
    and tgname='check_snake_incubator_location' and not tgisinternal and tgenabled<>'D') then
  raise exception '请先完成孵化柜迁移 053；本补丁未作修改';
 end if;
end $$;

create or replace function public.room_check_snake_location() returns trigger
language plpgsql security definer set search_path=public as $$
declare c jsonb;
begin
 select public.room_slot_cabinet(config,new.slot_id) into c from public.room_workspace where id=1;
 if c is null or c->>'type'='incubator' and c->>'purpose'='eggs'
 or exists(select 1 from public.room_incubation_allocations where slot_id=new.slot_id) then
  raise exception '孵蛋格不能安排蛇只';
 end if;
 if c->>'type'='incubator' and c->>'purpose'='brumation' then
  if exists(select 1 from public.room_feeding_records
    where snake_id=new.snake_id and result='offered') then
   raise exception '进入冬化前请先确认所有已投喂结果（包括未确认备料批次的投喂）';
  end if;
  if exists(
   select 1 from public.room_preparation_items i
   left join public.room_feeding_records f on f.snake_id=i.snake_id and f.planned_at=i.planned_at
   where i.snake_id=new.snake_id and (f.id is null or f.result='offered')) then
   raise exception '进入冬化前请先完成或跳过已确认备料任务，并确认已投喂结果';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.room_check_snake_location() from public,anon,authenticated;
commit;
notify pgrst,'reload schema';
