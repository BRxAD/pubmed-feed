-- Add taxonomy classification columns and rank_score to summaries.
-- Run this in the Supabase SQL Editor if the columns don't exist yet.

ALTER TABLE summaries
  ADD COLUMN IF NOT EXISTS subheading text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS rank_score numeric;
