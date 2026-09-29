begin;
alter table public.annual_breeding_plans
  add column expected_pairing_date date,
  add column expected_laying_date date,
  add column expected_hatching_date date,
  add column reminder_days integer not null default 3 check(reminder_days between 0 and 30),
  add column reminders_enabled boolean not null default true,
  add constraint breeding_expected_dates_order check (
    (expected_laying_date is null or expected_pairing_date is null or expected_laying_date>=expected_pairing_date) and
    (expected_hatching_date is null or expected_laying_date is null or expected_hatching_date>=expected_laying_date) and
    (expected_hatching_date is null or expected_pairing_date is null or expected_hatching_date>=expected_pairing_date));
alter table public.clutches add column if not exists hatch_start_date date;
alter table public.clutches add column if not exists hatch_end_date date;
alter table public.clutches add column expected_hatch_date date;

create function public.guard_pairing_date_before_laying() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.clutches where breeding_event_id=new.id and laid_date<new.paired_at) then
    raise exception '交配日期不能晚于已记录的产蛋日期';
  end if;
  return new;
end $$;
create trigger guard_pairing_date_before_laying before update of paired_at on public.breeding_events
for each row execute function public.guard_pairing_date_before_laying();

create function public.record_clutch_dates(p_id bigint,p_event_id bigint,p_code text,p_date date,p_eggs integer,p_fertile integer,p_hatched integer,p_status text,p_hatch_start date,p_hatch_end date,p_expected_hatch date)
returns bigint language plpgsql security definer set search_path=public as $$
declare result bigint;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  if p_hatch_start>current_date or p_hatch_end>current_date or p_hatch_start<p_date or
     (p_hatch_end is not null and (p_hatch_start is null or p_hatch_end<p_hatch_start)) or p_expected_hatch<p_date then
    raise exception '请核对产蛋、预计出壳及实际出壳日期，实际日期不能在未来';
  end if;
  if p_status='hatched' and p_hatch_start is null then raise exception '已出壳的窝次请填写实际开始出壳日期'; end if;
  if p_id is not null then
    perform 1 from public.clutches where id=p_id for update;
    if exists(select 1 from public.snakes where clutch_id=p_id and (birth_date<p_hatch_start or birth_date>p_hatch_end)) then
      raise exception '出壳日期范围与已登记幼体的出生日期不一致';
    end if;
  end if;
  result:=public.record_clutch(p_id,p_event_id,p_code,p_date,p_eggs,p_fertile,p_hatched,p_status);
  update public.clutches set hatch_start_date=p_hatch_start,hatch_end_date=p_hatch_end,expected_hatch_date=p_expected_hatch where id=result;
  return result;
end $$;
revoke all on function public.record_clutch_dates(bigint,bigint,text,date,integer,integer,integer,text,date,date,date) from public,anon;
grant execute on function public.record_clutch_dates(bigint,bigint,text,date,integer,integer,integer,text,date,date,date) to authenticated;

-- Complete calendar projection, independent from recent-record list limits.
create function public.breeding_calendar() returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'title',p.project_name,'year',p.plan_year,'status',p.status,'review_status',p.review_status,
 'female',p.female_snake_id,'male',p.male_snake_id,
 'expected_pairing_date',p.expected_pairing_date,'expected_laying_date',p.expected_laying_date,'expected_hatching_date',p.expected_hatching_date,
 'reminder_days',p.reminder_days,'reminders_enabled',p.reminders_enabled,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.paired_at,'status',e.status) order by e.paired_at,e.id) from public.breeding_events e where e.plan_id=p.id),'[]'::jsonb),
 'clutches',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'event_id',c.breeding_event_id,'code',c.clutch_code,'laid',c.laid_date,'hatch_start',c.hatch_start_date,'hatch_end',c.hatch_end_date,'expected_hatch',c.expected_hatch_date,'status',c.status) order by c.laid_date,c.id) from public.clutches c join public.breeding_events e on e.id=c.breeding_event_id where e.plan_id=p.id),'[]'::jsonb)
) order by p.plan_year desc,p.id),'[]'::jsonb)
from public.annual_breeding_plans p
where exists(select 1 from public.profiles where id=auth.uid() and active);
$$;
revoke all on function public.breeding_calendar() from public,anon;
grant execute on function public.breeding_calendar() to authenticated;
commit;
notify pgrst,'reload schema';
