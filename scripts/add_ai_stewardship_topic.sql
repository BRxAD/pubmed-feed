-- Add topic: Antimicrobial stewardship AND Artificial intelligence (MeSH OR keyword for both).
-- Used for /feed/ai-stewardship and weekly ingest (Jan 2024 to present, then weekly refresh).
-- Run in Supabase SQL Editor.

INSERT INTO topics (id, name, query_string)
SELECT gen_random_uuid(), 'Antimicrobial stewardship and artificial intelligence',
  '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract]) AND ("Artificial Intelligence"[MeSH] OR "artificial intelligence"[Title/Abstract])'
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name ILIKE '%Antimicrobial stewardship and artificial intelligence%');
