-- Consolidate StewardAI into the main Stewardship Brief topic.
-- Run in Supabase SQL Editor after scripts/add_antibiotic_use_to_query.sql (optional).
--
-- What this does:
-- 1. Ensures main topic query includes stewardship + antibiotic use
--    (AI papers still appear when they match those terms — no separate AI filter needed)
-- 2. Copies AI-topic summaries onto the main topic (so older AI papers can show in the brief)
-- 3. Deactivates the separate AI topic (stops treating it as a live feed)

-- Main topic search (stewardship / antibiotic use; AI papers included when they match)
update public.topics
set
  query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
  OR "antibiotic use"[Title/Abstract]
)

NOT
(
  animals[MeSH] NOT humans[MeSH]
  OR case reports[Publication Type]
)',
  openalex_query_string = '"antimicrobial stewardship" OR "antibiotic stewardship" OR "antibiotic use"'
where name ilike '%antimicrobial stewardship%'
  and name not ilike '%artificial intelligence%';

-- Copy AI-feed summaries onto the main topic when missing
insert into public.summaries (
  topic_id,
  pmid,
  summary_text,
  prompt_version,
  created_at,
  subheading,
  label,
  admin_priority
)
select
  main.id,
  s.pmid,
  s.summary_text,
  coalesce(s.prompt_version, 1),
  s.created_at,
  s.subheading,
  s.label,
  s.admin_priority
from public.summaries s
join public.topics ai
  on ai.id = s.topic_id
 and ai.name ilike '%artificial intelligence%'
join public.topics main
  on main.name ilike '%antimicrobial stewardship%'
 and main.name not ilike '%artificial intelligence%'
where not exists (
  select 1
  from public.summaries existing
  where existing.topic_id = main.id
    and existing.pmid = s.pmid
)
on conflict (topic_id, pmid) do nothing;

-- Retire the separate AI topic from active feeds
update public.topics
set is_active = false
where name ilike '%artificial intelligence%';
