# OpenAlex ingest (CID, OFID, ASHE, ICHE, CMI)

OpenAlex runs in the same 2× daily ingest as PubMed. It only takes **journal articles** from:

- Clinical Infectious Diseases (CID)
- Open Forum Infectious Diseases (OFID)
- Antimicrobial Stewardship & Healthcare Epidemiology (ASHE)
- Infection Control & Hospital Epidemiology (ICHE)
- Clinical Microbiology and Infection (CMI)

No preprints. Same drops as PubMed: letters, editorials, comments, case reports, animal-only. Merge on DOI so there is one row. Brief / email / Top 10 do not show an API label. `/feed` tags `OpenAlex`, then `OpenAlex · PubMed` once a PMID exists.

## 1. Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `OPENALEX_MAILTO` | Yes | Your email (OpenAlex polite pool) |
| `OPENALEX_API_KEY` | Recommended | Higher rate limits |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same as PubMed ingest |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same as PubMed ingest |
| `OPENAI_API_KEY` | If summarizing | Shared summarize cap with PubMed |

## 2. Supabase

`scripts/add_articles_doi.sql` is applied (doi / openalex_id / landing_url + `rekey_article_pmid`). `openalex_ingest_state` already exists.

## 3. Run ingest

The daily cron runs OpenAlex first, then PubMed, sharing the 40-summary cap.

**Manual POST** (GET is a health probe and does **not** ingest):

```bash
curl -X POST "http://localhost:3000/api/ingest/openalex?topicName=main&summarize=1&maxSummaries=10"
```

Or:

```bash
npx tsx scripts/run-openalex-ingest-now.ts
```

Backfill is capped at **28 days**. Do not raise that unless asked.

## 4. Dates

OpenAlex often stamps Cambridge FirstView as `2026-01-01` (volume year). The DOI / Crossref **published-online** date is the real online date. Ingest:

- Polls Crossref published-online for the same journals and 28-day window, then loads those DOIs from OpenAlex, so year-stamped papers are not skipped.
- Stores the Crossref published-online date (else OpenAlex created date), not the Jan 1 year stamp.

## 5. How merge works

- OpenAlex-first: insert once (PMID if OpenAlex already has one, else work id `W…`). Summarize now. Public link is the publisher/DOI until a PMID exists.
- PubMed later: match DOI, rewrite the id to the PMID, keep the OpenAlex summary/headline and original `fetched_at`, switch the public link to PubMed.
- PubMed-first: stamp `openalex_id`; skip a second summarize.

Legacy OpenAlex rows from the old ingest (W-ids with no DOI) stay in the database but are hidden from `/feed` and Brief.
