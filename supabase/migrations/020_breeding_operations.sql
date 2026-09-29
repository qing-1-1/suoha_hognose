-- Transactional bridges from plans to facts. Does not modify existing records.
begin;
create or replace function public.record_breeding_event(p_id bigint,p_plan_id bigint,p_female text,p_male text,p_date date,p_status text,p_notes text)
returns bigint language plpgsql security definer set search_path=public as $$
declare result bigint;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  if p_date is null or p_date>current_date then raise exception 'Actual pairing date must not be in the future'; end if;
  if p_status not in ('paired','observed_copulation','successful','unsuccessful','cancelled') then raise exception 'Invalid event status'; end if;
  if not exists(select 1 from public.snakes where id=p_female and sex='F') or not exists(select 1 from public.snakes where id=p_male and sex='M') then raise exception 'Choose a recorded female and male'; end if;
  if p_id is not null and exists(select 1 from public.clutches where breeding_event_id=p_id) and exists(select 1 from public.breeding_events where id=p_id and (female_snake_id<>p_female or male_snake_id<>p_male)) then raise exception 'Parents are locked after a clutch is recorded'; end if;
  if p_plan_id is not null and not exists(select 1 from public.annual_breeding_plans where id=p_plan_id and female_snake_id=p_female and male_snake_id=p_male and coalesce(review_status,'approved')='approved') then raise exception 'Plan must be approved and match both real parents'; end if;
  if p_id is null then
    insert into public.breeding_events(plan_id,female_snake_id,male_snake_id,paired_at,status,notes)
    values(p_plan_id,p_female,p_male,p_date,p_status,left(p_notes,4000)) returning id into result;
  else
    update public.breeding_events set plan_id=p_plan_id,female_snake_id=p_female,male_snake_id=p_male,paired_at=p_date,status=p_status,notes=left(p_notes,4000) where id=p_id returning id into result;
    if not found then raise exception 'Event not found'; end if;
  end if;
  return result;
end $$;
create or replace function public.record_clutch(p_id bigint,p_event_id bigint,p_code text,p_date date,p_eggs integer,p_fertile integer,p_hatched integer,p_status text)
returns bigint language plpgsql security definer set search_path=public as $$
declare event public.breeding_events; result bigint;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  select * into event from public.breeding_events where id=p_event_id for update;
  if not found then raise exception 'Breeding event not found'; end if;
  if p_date is null or p_date>current_date or p_date<event.paired_at then raise exception 'Invalid actual laying date'; end if;
  if p_status not in ('incubating','hatched','failed','archived') then raise exception 'Invalid clutch status'; end if;
  if p_eggs is null or p_eggs<0 or p_fertile<0 or p_hatched<0 or p_fertile>p_eggs or p_hatched>coalesce(p_fertile,p_eggs) then raise exception 'Check egg, fertile and hatchling counts'; end if;
  if p_id is not null then
    perform 1 from public.clutches where id=p_id for update;
    if not found then raise exception 'Clutch not found'; end if;
    if exists(select 1 from public.snakes where clutch_id=p_id) then
      if exists(select 1 from public.clutches where id=p_id and breeding_event_id is distinct from p_event_id) then raise exception 'Parents are locked after hatchlings are registered'; end if;
      if p_hatched is null or p_hatched<(select count(*) from public.snakes where clutch_id=p_id) then raise exception 'Hatch count cannot be smaller than registered animals'; end if;
    end if;
  end if;
  if p_id is null then
    insert into public.clutches(clutch_code,breeding_event_id,female_snake_id,male_snake_id,laid_date,egg_count,fertile_egg_count,hatched_count,status)
    values(nullif(btrim(p_code),''),p_event_id,event.female_snake_id,event.male_snake_id,p_date,p_eggs,p_fertile,p_hatched,p_status) returning id into result;
  else
    update public.clutches set clutch_code=nullif(btrim(p_code),''),breeding_event_id=p_event_id,female_snake_id=event.female_snake_id,male_snake_id=event.male_snake_id,laid_date=p_date,egg_count=p_eggs,fertile_egg_count=p_fertile,hatched_count=p_hatched,status=p_status where id=p_id returning id into result;
  end if;
  return result;
end $$;
create or replace function public.register_hatchling(p_clutch bigint,p_id text,p_sex text,p_birth date,p_series text,p_gene_text text,p_investor text)
returns text language plpgsql security definer set search_path=public as $$
declare clutch public.clutches;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  select * into clutch from public.clutches where id=p_clutch for update;
  if not found or clutch.status<>'hatched' then raise exception 'Record a hatched clutch first'; end if;
  if p_birth is null or p_birth>current_date or p_birth<clutch.laid_date then raise exception 'Invalid hatch date'; end if;
  if p_id !~ '^[A-Za-z0-9_-]{1,64}$' or p_sex not in ('M','F','U') then raise exception 'Invalid animal ID or sex'; end if;
  if clutch.hatched_count is null or (select count(*) from public.snakes where clutch_id=p_clutch)>=clutch.hatched_count then raise exception 'All recorded hatchlings are already registered'; end if;
  insert into public.snakes(id,series,gene_text,sex,birth_date,status,origin,dam_id,sire_id,clutch_id,investor,price,strategic_score)
  values(p_id,left(p_series,100),left(p_gene_text,300),p_sex,p_birth,'active','produced',clutch.female_snake_id,clutch.male_snake_id,p_clutch,p_investor,0,0);
  return p_id;
end $$;
revoke all on function public.record_breeding_event(bigint,bigint,text,text,date,text,text) from public,anon;
revoke all on function public.record_clutch(bigint,bigint,text,date,integer,integer,integer,text) from public,anon;
revoke all on function public.register_hatchling(bigint,text,text,date,text,text,text) from public,anon;
grant execute on function public.record_breeding_event(bigint,bigint,text,text,date,text,text) to authenticated;
grant execute on function public.record_clutch(bigint,bigint,text,date,integer,integer,integer,text) to authenticated;
grant execute on function public.register_hatchling(bigint,text,text,date,text,text,text) to authenticated;
commit;
notify pgrst,'reload schema';
