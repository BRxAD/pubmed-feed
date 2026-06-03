-- Fix "Insert summary failed" on ingest: summaries table must have subheading and label.
-- Run this in the Supabase SQL Editor once.

ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS subheading text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS rank_score numeric;
