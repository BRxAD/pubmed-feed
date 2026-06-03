--- Supabase schema: corrected version of your SQL (fixes below).
-- Run in Supabase SQL Editor in order.

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  query_string text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  pmid text primary key,
  title text,
  abstract text,
  journal text,
  pub_date date,
  publication_types text[],
  mesh_terms text[],
  keywords text[],
  authors text[],
  source text not null default 'pubmed',
  fetched_at timestamptz not null default now()
);

create extension if not exists "pgcrypto";

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values (
  'summary_prompt_v1',
  'Summarize the abstract in exactly three sentences. Be specific about population, intervention/exposure, design, and key results. Avoid hype.'
)
on conflict (key) do nothing;

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  pmid text not null references public.articles(pmid) on delete cascade,
  summary_text text not null,
  prompt_version int not null default 1,
  created_at timestamptz not null default now(),
  unique(topic_id, pmid)
);

-- FIX 1: Added missing semicolon after journal_metrics definition.
create table if not exists public.journal_metrics (
  journal_name text primary key,
  jif_2024 numeric,
  jcr_rank int,
  jif_quartile text
);

-- Add topic: Antimicrobial stewardship AND Artificial intelligence (broad query).
insert into topics (id, name, query_string)
select gen_random_uuid(), 'Antimicrobial stewardship and artificial intelligence',
  '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract]) AND ("Artificial Intelligence"[MeSH] OR "artificial intelligence"[Title/Abstract])'
where not exists (select 1 from topics where name ilike '%Antimicrobial stewardship and artificial intelligence%');

-- Broaden default topic (main feed) search.
update topics
set query_string = '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract])'
where name ilike '%antimicrobial stewardship%'
  and name not ilike '%artificial intelligence%';

-- Broaden AI topic search (if row already exists).
update topics
set query_string = '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract]) AND ("Artificial Intelligence"[MeSH] OR "artificial intelligence"[Title/Abstract])'
where name ilike '%antimicrobial stewardship and artificial intelligence%';

-- FIX 2: Removed stray ")" — use "numeric;" not "numeric);"
alter table public.summaries
  add column if not exists subheading text,
  add column if not exists label text,
  add column if not exists rank_score numeric;
