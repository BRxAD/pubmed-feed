-- Higher-yield clinical/implementation queries for PubMed + OpenAlex.
-- Run in Supabase SQL Editor.

-- Schema additions (safe if re-run)
alter table public.topics
  add column if not exists openalex_query_string text;

alter table public.topics
  add column if not exists ranking_weights jsonb;

alter table public.summaries
  add column if not exists admin_priority smallint
  check (admin_priority is null or (admin_priority >= 1 and admin_priority <= 10));

create table if not exists public.relevance_feedback (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  pmid text not null references public.articles(pmid) on delete cascade,
  admin_priority smallint not null check (admin_priority between 1 and 10),
  feature_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists relevance_feedback_topic_idx
  on public.relevance_feedback (topic_id, created_at desc);

-- MAIN FEED: antimicrobial stewardship, higher-yield clinical/implementation studies
update public.topics
set
  query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
)

NOT
(
  animals[MeSH] NOT humans[MeSH]
  OR case reports[Publication Type]
)',
  openalex_query_string = '"antimicrobial stewardship" OR "antibiotic stewardship"'
where name ilike '%antimicrobial stewardship%'
  and name not ilike '%artificial intelligence%';

-- AI FEED: stewardship + AI, tighter and more newsworthy
update public.topics
set
  query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
  OR "antibiotic prescribing"[Title/Abstract]
)
AND
(
  "Artificial Intelligence"[MeSH]
  OR "machine learning"[Title/Abstract]
  OR "deep learning"[Title/Abstract]
  OR "natural language processing"[Title/Abstract]
  OR NLP[Title/Abstract]
  OR algorithm*[Title/Abstract]
  OR "predictive model"[Title/Abstract]
)
NOT
(
  animals[MeSH] NOT humans[MeSH]
  OR case reports[Publication Type]
)',
  openalex_query_string = '("antimicrobial stewardship" OR "antibiotic stewardship" OR "antibiotic prescribing") AND ("machine learning" OR "deep learning" OR "natural language processing" OR NLP OR algorithm OR "predictive model")'
where name ilike '%artificial intelligence%';
