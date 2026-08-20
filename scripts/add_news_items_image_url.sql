-- Add optional article thumbnail URL for In the news.
-- Run in Supabase SQL Editor if news_items already exists. ASCII-only.

alter table public.news_items
  add column if not exists image_url text;
