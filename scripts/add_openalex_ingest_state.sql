-- OpenAlex ingest watermark (publication-date window per topic).
-- Run in Supabase SQL Editor.

create table if not exists public.openalex_ingest_state (
  topic_id uuid primary key references public.topics(id) on delete cascade,
  last_publication_max date not null,
  updated_at timestamptz not null default now()
);

-- Ensure articles can store openalex source (if column missing from older schema).
alter table public.articles
  add column if not exists source text not null default 'pubmed';
