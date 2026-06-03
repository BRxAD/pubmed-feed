-- Main feed: use MeSH only to reduce result set and avoid fetch/timeouts.
-- Run in Supabase SQL Editor. Run this for the main (stewardship-only) topic.
-- AI topic is unchanged (keep broad search via update_topic_queries_broad.sql).

UPDATE topics
SET query_string = '"Antimicrobial Stewardship"[MeSH]'
WHERE name ILIKE '%antimicrobial stewardship%'
  AND name NOT ILIKE '%artificial intelligence%';
