-- Watermark table: tracks the most recent PubMed Create Date (crdt) successfully
-- ingested for each topic. Used by incremental ingest to avoid re-scanning the
-- full history on every run.
--
-- Run in Supabase SQL Editor.

create table if not exists public.pubmed_ingest_state (
  topic_id   uuid    primary key references public.topics(id) on delete cascade,
  last_crdt_max date  not null,
  updated_at timestamptz not null default now()
);

-- Optional: index is not needed (topic_id is already the PK), but grant
-- read/write to the service role if RLS is enabled on your project.
-- alter table public.pubmed_ingest_state enable row level security;
-- create policy "service role full access"
--   on public.pubmed_ingest_state
--   using (true) with check (true);
