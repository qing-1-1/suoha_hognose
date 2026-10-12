begin;
alter table public.snake_series add column if not exists archived boolean not null default false;
create or replace function public.archive_snake_series(p_name text,p_archived boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 lock table public.snakes in share row exclusive mode;
 if p_archived and exists(select 1 from public.snakes where p_name=any(series_names)) then raise exception '仍有个体使用此系列，不能归档'; end if;
 update public.snake_series set archived=p_archived where name=p_name;
 if not found then raise exception 'Series not found'; end if;
end $$;
create or replace function public.validate_snake_pedigree() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.clutches;
begin
 if new.sire_id=new.id or new.dam_id=new.id then raise exception '个体不能是自己的亲本'; end if;
 if new.sire_id is not null and not exists(select 1 from public.snakes where id=new.sire_id and sex='M') then raise exception '请选择已登记的公本'; end if;
 if new.dam_id is not null and not exists(select 1 from public.snakes where id=new.dam_id and sex='F') then raise exception '请选择已登记的母本'; end if;
 if exists(with recursive ancestors(id) as (select unnest(array[new.sire_id,new.dam_id]) union select unnest(array[s.sire_id,s.dam_id]) from public.snakes s join ancestors a on s.id=a.id) select 1 from ancestors where id=new.id) then raise exception '亲本关系不能形成循环'; end if;
 if new.birth_date is not null and exists(select 1 from public.snakes where id in (new.sire_id,new.dam_id) and birth_date>=new.birth_date) then raise exception '子代出生日期必须晚于亲本'; end if;
 if new.clutch_id is not null then
  select * into c from public.clutches where id=new.clutch_id for update;
  if not found or c.female_snake_id is distinct from new.dam_id or c.male_snake_id is distinct from new.sire_id then raise exception '亲本必须与关联窝次一致'; end if;
  if new.origin is distinct from 'produced' then raise exception '窝次个体必须标记为自繁'; end if;
  if c.status<>'hatched' or c.hatched_count is null or (select count(*) from public.snakes where clutch_id=new.clutch_id and id<>new.id)>=c.hatched_count then raise exception '关联窝次尚未孵化或登记数量已满'; end if;
  if new.birth_date<c.hatch_start_date or new.birth_date>c.hatch_end_date then raise exception '出生日期必须在窝次实际出壳范围内'; end if;
 end if;
 return new;
end $$;
drop trigger if exists snake_pedigree_guard on public.snakes;
create trigger snake_pedigree_guard before insert or update of sire_id,dam_id,clutch_id,birth_date on public.snakes for each row execute function public.validate_snake_pedigree();
create table if not exists public.pairing_snapshots(id uuid primary key default gen_random_uuid(),name text not null,planning_year integer not null,snapshot jsonb not null,created_by uuid not null default auth.uid(),created_at timestamptz not null default now());
alter table public.pairing_snapshots enable row level security;
revoke all on public.pairing_snapshots from public,anon,authenticated;
grant select,insert on public.pairing_snapshots to authenticated;
drop policy if exists pairing_snapshots_read on public.pairing_snapshots;
create policy pairing_snapshots_read on public.pairing_snapshots for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and active));
drop policy if exists pairing_snapshots_write on public.pairing_snapshots;
create policy pairing_snapshots_write on public.pairing_snapshots for insert to authenticated with check(public.can_edit_app() and created_by=auth.uid());
alter table public.annual_breeding_plans add column if not exists pairing_snapshot_id uuid references public.pairing_snapshots(id);
alter table public.breeding_events add column if not exists historical_reason text;
create or replace function public.record_breeding_event_v2(p_id bigint,p_plan_id bigint,p_female text,p_male text,p_date date,p_status text,p_notes text,p_historical_reason text default '') returns bigint
language plpgsql security definer set search_path=public as $$
declare result bigint;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if nullif(btrim(p_historical_reason),'') is null and exists(select 1 from public.snakes where id in (p_female,p_male) and (status<>'active' or inventory_library<>'stock')) then raise exception '当前配种仅限在养种群；补录历史请填写原因'; end if;
 if exists(select 1 from public.snakes where id in (p_female,p_male) and birth_date>p_date) then raise exception '配种日期不能早于亲本出生日期'; end if;
 if p_plan_id is not null and exists(select 1 from public.annual_breeding_plans where id=p_plan_id and status='cancelled') then raise exception '已取消的计划不能新增实际配种'; end if;
 result:=public.record_breeding_event(p_id,p_plan_id,p_female,p_male,p_date,p_status,p_notes);
 update public.breeding_events set historical_reason=nullif(btrim(p_historical_reason),'') where id=result;
 return result;
end $$;
revoke execute on function public.record_breeding_event(bigint,bigint,text,text,date,text,text) from authenticated;
revoke all on function public.record_breeding_event_v2(bigint,bigint,text,text,date,text,text,text) from public,anon;
grant execute on function public.record_breeding_event_v2(bigint,bigint,text,text,date,text,text,text) to authenticated;

create or replace function public.save_prompt_version(p_id bigint,p_prompt text) returns integer
language plpgsql security definer set search_path=public as $$
declare original public.ai_prompt_templates; v integer;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='admin') then raise exception 'Not authorized'; end if;
 select * into original from public.ai_prompt_templates where id=p_id;
 if not found or length(btrim(p_prompt))<80 then raise exception '请检查模板与提示词长度'; end if;
 perform pg_advisory_xact_lock(hashtextextended(original.template_key,0));
 if not exists(select 1 from public.ai_prompt_templates where id=p_id and is_active) then raise exception '提示词已被其他人更新，请刷新后重试'; end if;
 select max(version)+1 into v from public.ai_prompt_templates where template_key=original.template_key;
 update public.ai_prompt_templates set is_active=false where template_key=original.template_key;
 insert into public.ai_prompt_templates(template_key,version,name,analysis_type,system_prompt,response_schema_version,is_active) values(original.template_key,v,original.name,original.analysis_type,p_prompt,original.response_schema_version,true);
 return v;
end $$;
revoke all on function public.archive_snake_series(text,boolean),public.save_prompt_version(bigint,text) from public,anon;
grant execute on function public.archive_snake_series(text,boolean),public.save_prompt_version(bigint,text) to authenticated;
create or replace function public.require_plan_close_reason() returns trigger language plpgsql as $$
begin
 if new.status in ('completed','cancelled') and (tg_op='INSERT' or old.status is distinct from new.status) and nullif(btrim(new.completion_reason),'') is null then raise exception '请填写结案或取消原因'; end if;
 return new;
end $$;
drop trigger if exists plan_close_reason on public.annual_breeding_plans;
create trigger plan_close_reason before insert or update of status on public.annual_breeding_plans for each row execute function public.require_plan_close_reason();
create table if not exists public.pedigree_history(id bigint generated always as identity primary key,snake_id text not null,before_value jsonb,after_value jsonb not null,actor_id uuid default auth.uid(),created_at timestamptz not null default now());
alter table public.pedigree_history enable row level security;
revoke all on public.pedigree_history from public,anon,authenticated;
grant select on public.pedigree_history to authenticated;
drop policy if exists pedigree_history_read on public.pedigree_history;
create policy pedigree_history_read on public.pedigree_history for select to authenticated using(public.can_edit_app());
create or replace function public.log_pedigree_change() returns trigger language plpgsql security definer set search_path=public as $$
declare before_value jsonb; after_value jsonb;
begin
 after_value:=jsonb_build_object('sire',new.sire_id,'dam',new.dam_id,'clutch',new.clutch_id);
 if tg_op='UPDATE' then before_value:=jsonb_build_object('sire',old.sire_id,'dam',old.dam_id,'clutch',old.clutch_id); end if;
 if before_value is distinct from after_value then insert into public.pedigree_history(snake_id,before_value,after_value) values(new.id,before_value,after_value); end if;
 update public.snake_series set archived=false where archived and name=any(new.series_names);
 return new;
end $$;
drop trigger if exists pedigree_change_history on public.snakes;
create trigger pedigree_change_history after insert or update of sire_id,dam_id,clutch_id,series_names on public.snakes for each row execute function public.log_pedigree_change();
commit;
notify pgrst,'reload schema';
