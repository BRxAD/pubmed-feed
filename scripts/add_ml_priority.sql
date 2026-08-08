-- Stored first ML priority (embedding-aware) written at ingest.
-- Page loads read this instead of re-fetching embedding JSON.
-- Run in Supabase SQL Editor.

alter table public.summaries
  add column if not exists ml_priority smallint
  check (
    ml_priority is null
    or (ml_priority >= 1 and ml_priority <= 10)
  );

comment on column public.summaries.ml_priority is
  'First ML priority (1–10) from ingest-time model+embeddings; admin_priority still wins when set.';
