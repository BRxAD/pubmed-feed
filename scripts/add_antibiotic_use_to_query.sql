-- Add "antibiotic use" to the main PubMed + OpenAlex topic queries.
-- AI papers still appear when they match these stewardship / antibiotic-use terms.
-- For full AI-feed consolidation (copy old summaries + retire AI topic), also run:
--   scripts/consolidate_ai_into_main.sql

update public.topics
set
  query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
  OR "antibiotic use"[Title/Abstract]
)

NOT
(
  animals[MeSH] NOT humans[MeSH]
  OR case reports[Publication Type]
)',
  openalex_query_string = '"antimicrobial stewardship" OR "antibiotic stewardship" OR "antibiotic use"'
where name ilike '%antimicrobial stewardship%'
  and name not ilike '%artificial intelligence%';
