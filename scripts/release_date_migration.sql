-- Release date: ensure columns exist, backfill, and clamp to today.
-- Run in Supabase SQL Editor. Run after add_articles_date_columns.sql if needed.

-- 1. Ensure date columns exist on articles
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS article_date date,
  ADD COLUMN IF NOT EXISTS epub_date date,
  ADD COLUMN IF NOT EXISTS pubmed_date date,
  ADD COLUMN IF NOT EXISTS release_date date;

-- 2. Backfill release_date for existing rows using priority:
--    article_date -> epub_date -> pubmed_date -> pub_date -> fetched_at::date
UPDATE public.articles
SET release_date = COALESCE(
  article_date,
  epub_date,
  pubmed_date,
  pub_date,
  (fetched_at::date)
)
WHERE release_date IS NULL;

-- 3. Clamp release_date so it is never in the future
UPDATE public.articles
SET release_date = LEAST(release_date, CURRENT_DATE)
WHERE release_date > CURRENT_DATE;
