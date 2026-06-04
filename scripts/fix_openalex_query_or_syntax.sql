-- Fix OpenAlex query strings: use OR (uppercase), not pipe |.
-- Run in Supabase if you already applied update_topic_queries_clinical.sql.

update public.topics
set openalex_query_string = '"antimicrobial stewardship" OR "antibiotic stewardship"'
where name ilike '%antimicrobial stewardship%'
  and name not ilike '%artificial intelligence%';

update public.topics
set openalex_query_string = '("antimicrobial stewardship" OR "antibiotic stewardship" OR "antibiotic prescribing") AND ("machine learning" OR "deep learning" OR "natural language processing" OR NLP OR algorithm OR "predictive model")'
where name ilike '%artificial intelligence%';
