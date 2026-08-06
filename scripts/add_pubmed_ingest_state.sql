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

-- Lock down API access: service role (used by ingest) bypasses RLS.
-- See also scripts/enable_rls_ingest_state.sql
alter table public.pubmed_ingest_state enable row level security;
