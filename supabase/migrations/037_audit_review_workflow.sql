begin;
-- Existing installations already have acquired_snake_id and its foreign key.
-- Preserve existing columns/data and allow this migration to be retried.
alter table public.annual_breeding_plans add column if not exists review_reason text,add column if not exists completion_reason text;
alter table public.investments add column if not exists review_reason text,add column if not exists acquired_snake_id text references public.snakes(id) on delete set null;
create table if not exists public.business_review_history(id bigint generated always as identity primary key,kind text not null,record_id text not null,from_status text,to_status text not null,reason text,actor_id uuid not null default auth.uid(),created_at timestamptz not null default now());
alter table public.business_review_history enable row level security;
revoke all on public.business_review_history from public,anon,authenticated;
grant select on public.business_review_history to authenticated;
drop policy if exists review_history_read on public.business_review_history;
create policy review_history_read on public.business_review_history for select to authenticated using(public.can_edit_app());
create or replace function public.review_business_record(p_kind text,p_id text,p_status text,p_reason text default '') returns void
language plpgsql security definer set search_path=public as $$
declare t text; old_status text; recommendation bigint; scenario bigint;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if p_kind not in ('annual','investment') or p_status not in ('approved','returned','pending') then raise exception 'Invalid review'; end if;
 if p_status='returned' and nullif(btrim(p_reason),'') is null then raise exception '请填写退回原因'; end if;
 t:=case p_kind when 'annual' then 'annual_breeding_plans' else 'investments' end;
 -- Serialize reviews of one scenario so accepting the last sibling is race-safe.
 perform pg_advisory_xact_lock(hashtextextended('business-review',0));
 execute format('select review_status,ai_recommendation_id from public.%I where id::text=$1 for update',t) into old_status,recommendation using p_id;
 if old_status is null then raise exception 'Review record not found'; end if;
 if old_status=p_status then return; end if;
 if not ((old_status='pending' and p_status in ('approved','returned')) or (old_status='returned' and p_status='pending')) then raise exception '审核状态已改变，请刷新后重试'; end if;
 execute format('update public.%I set review_status=$1,review_reason=$2,reviewed_at=now() where id::text=$3',t) using p_status,left(p_reason,2000),p_id;
 if recommendation is not null then
  update public.ai_recommendations set status=case when p_status='approved' then 'applied' else 'accepted' end,reviewed_at=now(),applied_at=case when p_status='approved' then now() else null end where id=recommendation;
  if not found then raise exception 'Linked recommendation not found'; end if;
 end if;
 if p_kind='annual' then
  select scenario_id into scenario from public.annual_breeding_plans where id::text=p_id;
  if scenario is not null and not exists(select 1 from public.annual_breeding_plans where scenario_id=scenario and review_status<>'approved') then
   update public.planning_scenarios set status='accepted',reviewed_at=now(),reviewed_by=auth.uid() where id=scenario;
  end if;
 end if;
 insert into public.business_review_history(kind,record_id,from_status,to_status,reason) values(p_kind,p_id,old_status,p_status,left(p_reason,2000));
end $$;

create or replace function public.submit_ai_business_review(p_id bigint,p_kind text,p_year integer) returns text
language plpgsql security definer set search_path=public as $$
declare r public.ai_recommendations; p jsonb; result text; scenario bigint; y integer;
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 if p_kind not in ('annual','investment') or p_year not between 2000 and 2200 then raise exception 'Invalid submission'; end if;
 select * into r from public.ai_recommendations where id=p_id for update;
 if not found then raise exception 'Recommendation not found'; end if;
 if p_kind='annual' then select id::text into result from public.annual_breeding_plans where ai_recommendation_id=p_id;
 else select id into result from public.investments where ai_recommendation_id=p_id; end if;
 if result is not null then return result; end if;
 if r.status not in ('proposed','accepted') then raise exception '建议状态已改变'; end if;
 p:=coalesce(r.proposal_payload,'{}');
 if p_kind='annual' then
  y:=case when p->>'action'='create_annual_plan' then coalesce((p->>'plan_year')::integer,p_year) else p_year end;
  insert into public.planning_scenarios(name,scenario_type,status,planning_year) values(y||' 年 AI 审核草案','ai_draft','draft',y) returning id into scenario;
  insert into public.annual_breeding_plans(scenario_id,plan_year,priority,route_id,project_name,female_snake_id,male_snake_id,goal,mode,status,planned_clutches,notes,source_type,review_status,ai_recommendation_id,submitted_at)
  values(scenario,y,coalesce(p->>'priority','C'),p->>'route_id',coalesce(p->>'project_name',r.title),p->>'female_snake_id',p->>'male_snake_id',coalesce(p->>'goal',r.summary),'人工复核 AI 草案','planned',case when p->>'action'='create_annual_plan' then coalesce((p->>'planned_clutches')::integer,1) else 0 end,'AI 建议 #'||p_id,'ai','pending',p_id,now()) returning id::text into result;
 else
  result:='AI-'||p_id;
  insert into public.investments(id,name,category,status,rank,strategic_score,target_sex,planned_year,thesis,criteria,notes,source_type,review_status,ai_recommendation_id,submitted_at)
  values(result,r.title,'other','planned',coalesce(r.priority_score,0),coalesce(r.priority_score,0),p->>'target_sex',p_year,r.summary,'[]','AI 建议 #'||p_id,'ai','pending',p_id,now());
 end if;
 update public.ai_recommendations set status='accepted',reviewed_at=now() where id=p_id;
 return result;
end $$;

create or replace function public.complete_breeding_plan(p_id bigint,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 perform 1 from public.annual_breeding_plans where id=p_id and status<>'cancelled' and review_status='approved' for update;
 if not found then raise exception '只能结束已通过且未取消的计划'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception '请填写结案说明，未完成窝次须注明原因'; end if;
 update public.annual_breeding_plans set status='completed',completion_reason=left(p_reason,2000) where id=p_id;
end $$;
revoke all on function public.review_business_record(text,text,text,text),public.submit_ai_business_review(bigint,text,integer),public.complete_breeding_plan(bigint,text) from public,anon;
grant execute on function public.review_business_record(text,text,text,text),public.submit_ai_business_review(bigint,text,integer),public.complete_breeding_plan(bigint,text) to authenticated;
commit;
notify pgrst,'reload schema';
