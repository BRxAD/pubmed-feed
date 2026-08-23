-- Persist WHO region labels at ingest (African Region, Americas, SEAR,
-- European, Eastern Mediterranean, Western Pacific). Rules-only
-- classifyWhoRegion from affiliations + title + keywords + MeSH.
-- Going forward; no backfill unless asked. Run in Supabase SQL Editor.
-- ASCII-only comments.

alter table public.summaries
  add column if not exists auto_who_regions text[];

comment on column public.summaries.auto_who_regions is
  'Auto multi-label WHO regions from ingest classifyArticleWhoRegions (going forward).';

create index if not exists summaries_auto_who_regions_gin
  on public.summaries using gin (auto_who_regions);
