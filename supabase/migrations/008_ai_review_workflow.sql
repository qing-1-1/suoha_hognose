-- AI and manual decisions use the same business tables.
-- AI rows are distinguished by source_type and wait for review_status = approved
-- before they are shown on the normal investment / annual-planning pages.

begin;

alter table public.investments
  add column if not exists source_type text not null default 'manual',
  add column if not exists review_status text not null default 'approved',
  add column if not exists ai_recommendation_id bigint references public.ai_recommendations(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.annual_breeding_plans
  add column if not exists source_type text not null default 'manual',
  add column if not exists review_status text not null default 'approved',
  add column if not exists ai_recommendation_id bigint references public.ai_recommendations(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.investments
  drop constraint if exists investments_source_type_check,
  add constraint investments_source_type_check check (source_type in ('manual','ai')),
  drop constraint if exists investments_review_status_check,
  add constraint investments_review_status_check check (review_status in ('pending','approved','returned'));

alter table public.annual_breeding_plans
  drop constraint if exists annual_breeding_plans_source_type_check,
  add constraint annual_breeding_plans_source_type_check check (source_type in ('manual','ai')),
  drop constraint if exists annual_breeding_plans_review_status_check,
  add constraint annual_breeding_plans_review_status_check check (review_status in ('pending','approved','returned'));

create unique index if not exists uq_investments_ai_recommendation
  on public.investments(ai_recommendation_id) where ai_recommendation_id is not null;
create unique index if not exists uq_annual_plans_ai_recommendation
  on public.annual_breeding_plans(ai_recommendation_id) where ai_recommendation_id is not null;
create index if not exists idx_investments_review_queue
  on public.investments(review_status, source_type, planned_year);
create index if not exists idx_annual_plans_review_queue
  on public.annual_breeding_plans(review_status, source_type, plan_year);

-- Bring forward AI drafts created before this workflow existed.
update public.annual_breeding_plans p
set source_type = 'ai', review_status = 'pending'
from public.planning_scenarios s
where p.scenario_id = s.id
  and s.scenario_type = 'ai_draft'
  and p.source_type = 'manual';

-- Preserve the link for drafts created by the earlier AI workflow so their
-- cards also reflect the actual per-record review state.
update public.annual_breeding_plans p
set ai_recommendation_id = (regexp_match(p.notes, 'AI 建议 #([0-9]+)'))[1]::bigint
where p.ai_recommendation_id is null
  and p.notes ~ 'AI 建议 #[0-9]+';

update public.investments i
set ai_recommendation_id = (regexp_match(i.notes, 'AI 建议 #([0-9]+)'))[1]::bigint
where i.ai_recommendation_id is null
  and i.notes ~ 'AI 建议 #[0-9]+';

commit;
