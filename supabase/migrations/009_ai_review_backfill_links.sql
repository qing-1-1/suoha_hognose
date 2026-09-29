-- Safe follow-up for installations where 008 was already applied before
-- AI recommendation links were recorded on legacy draft rows.

begin;

update public.annual_breeding_plans p
set ai_recommendation_id = (regexp_match(p.notes, 'AI 建议 #([0-9]+)'))[1]::bigint
where p.ai_recommendation_id is null
  and p.notes ~ 'AI 建议 #[0-9]+';

update public.investments i
set ai_recommendation_id = (regexp_match(i.notes, 'AI 建议 #([0-9]+)'))[1]::bigint
where i.ai_recommendation_id is null
  and i.notes ~ 'AI 建议 #[0-9]+';

commit;
