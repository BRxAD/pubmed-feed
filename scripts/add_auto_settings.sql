-- Persist auto multi-label settings at ingest so page loads do not need
-- keywords/MeSH bulk reads to classify. Admin_setting still wins when set.
-- Run in Supabase SQL Editor. ASCII-only comments.

alter table public.summaries
  add column if not exists auto_settings text[];

comment on column public.summaries.auto_settings is
  'Auto multi-label settings from ingest classifyArticleSettings; admin_setting wins when set.';

create index if not exists summaries_auto_settings_gin
  on public.summaries using gin (auto_settings);
