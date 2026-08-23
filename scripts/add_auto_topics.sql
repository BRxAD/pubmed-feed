-- Persist multi-label syndrome/topic capsules at ingest (Urinary, Respiratory,
-- Skin & Soft Tissue, Artificial Intelligence). Rules-only classifyTopic.
-- Run in Supabase SQL Editor. ASCII-only comments.

alter table public.summaries
  add column if not exists auto_topics text[];

comment on column public.summaries.auto_topics is
  'Auto multi-label topics from ingest classifyArticleTopics (going forward).';

create index if not exists summaries_auto_topics_gin
  on public.summaries using gin (auto_topics);
