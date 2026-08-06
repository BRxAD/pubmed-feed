-- Enable RLS on ingest watermark tables (Supabase Security Advisor).
-- Run in Supabase SQL Editor.
--
-- The Next.js app uses SUPABASE_SERVICE_ROLE_KEY for these tables, which
-- bypasses RLS. Enabling RLS with no anon/authenticated policies locks the
-- tables to the service role only (same pattern as brief_subscribers).

alter table public.pubmed_ingest_state enable row level security;
alter table public.openalex_ingest_state enable row level security;

-- Optional: explicit deny is the default when no policies exist.
-- Do NOT add a public "using (true)" policy — that would re-open the table.
