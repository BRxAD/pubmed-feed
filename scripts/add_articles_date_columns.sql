-- Add date and relevance columns to articles for the ingest API.
-- Run in Supabase SQL Editor if your schema doesn't have these yet.

alter table public.articles
  add column if not exists article_date date,
  add column if not exists epub_date date,
  add column if not exists pubmed_date date,
  add column if not exists release_date date,
  add column if not exists relevance_score numeric;
