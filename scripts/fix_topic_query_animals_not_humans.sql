-- Fix main topic animal filter.
-- Bare animals[MeSH] explodes to include Humans (MeSH hierarchy), so MEDLINE
-- human clinical papers were excluded from ingest. Use the standard PubMed
-- animal-only exclusion: animals NOT humans.
-- Run in Supabase SQL Editor.

UPDATE public.topics
SET query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
  OR "antibiotic use"[Title/Abstract]
  OR "antimicrobial use"[Title/Abstract]
  OR "antimicrobial exposure"[Title/Abstract]
  OR "antibiotic exposure"[Title/Abstract]
  OR "antibiotic treatment"[Title/Abstract]
  OR "antimicrobial treatment"[Title/Abstract]
)

NOT
(
  (animals[MeSH] NOT humans[MeSH])
  OR case reports[Publication Type]
)'
WHERE name ILIKE '%antimicrobial stewardship%'
  AND name NOT ILIKE '%artificial intelligence%';
