-- Broaden PubMed search to include MeSH OR Title/Abstract so more relevant articles are found
-- (e.g. "antibiotic stewardship" in title/abstract, or AI keyword when not yet MeSH-tagged).
-- Run in Supabase SQL Editor.

-- 1. Default topic (main feed): antimicrobial stewardship OR antibiotic stewardship (MeSH or keyword)
UPDATE topics
SET query_string = '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract])'
WHERE name ILIKE '%antimicrobial stewardship%'
  AND name NOT ILIKE '%artificial intelligence%';

-- 2. AI + stewardship topic: same stewardship breadth AND artificial intelligence (MeSH or keyword)
UPDATE topics
SET query_string = '("Antimicrobial Stewardship"[MeSH] OR "antimicrobial stewardship"[Title/Abstract] OR "antibiotic stewardship"[Title/Abstract]) AND ("Artificial Intelligence"[MeSH] OR "artificial intelligence"[Title/Abstract])'
WHERE name ILIKE '%antimicrobial stewardship and artificial intelligence%';
