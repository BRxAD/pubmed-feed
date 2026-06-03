# Feed: Antimicrobial stewardship and artificial intelligence

A **separate feed** for literature on **antimicrobial stewardship** AND **artificial intelligence**, using PubMed MeSH. Coverage: **Jan 2024 to present**, with **weekly** refresh.

## 1. Add the topic in Supabase

In the Supabase SQL Editor, run `scripts/add_ai_stewardship_topic.sql` to insert the topic (query uses MeSH OR Title/Abstract for both stewardship and AI). To broaden an existing default or AI topic so more articles are found, run `scripts/update_topic_queries_broad.sql`.

## 2. One-time initial ingest (Jan 2024 – present)

This backfills articles from **2024-01-01** through **today** (up to 500 results).

1. Start the dev server: `npm run dev`
2. Run: `npm run ingest:ai-stewardship` (or `npx tsx scripts/run-ai-stewardship-initial-ingest.ts`)

Or call the API manually (after getting the topic id from `GET /api/health/supabase`):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"topicId":"YOUR_AI_STEWARDSHIP_TOPIC_ID","mindate":"2024-01-01","maxdate":"2025-02-21"}'
```

Use today’s date for `maxdate` (YYYY-MM-DD).

## 3. View the feed

- **URL:** `http://localhost:3000/feed/ai-stewardship` (or your deployed base URL + `/feed/ai-stewardship`)
- Sort by **Relevance** or **Recency**; titles link to PubMed.

## 4. Weekly refresh (automatic)

Ingest for this topic uses the same **last 7 days** logic when no date range is sent. To refresh weekly:

- **Endpoint:** `GET https://YOUR_DOMAIN/api/cron/ingest-weekly?secret=YOUR_CRON_SECRET`
- Uses the same **CRON_SECRET** as the daily ingest.
- **Schedule:** e.g. once per week (cron-job.org: weekly on Sunday 6:00 AM America/New_York, or Vercel Cron `0 11 * * 0` for Sunday 11:00 UTC).

After the initial run (step 2), set up this cron so new articles are added every week.

## Summary

| Item | Value |
|------|--------|
| Topic name | Antimicrobial stewardship and artificial intelligence |
| PubMed query | MeSH OR Title/Abstract for both: stewardship (antimicrobial/antibiotic) AND artificial intelligence. See `scripts/add_ai_stewardship_topic.sql` or `scripts/update_topic_queries_broad.sql`. |
| Feed page | `/feed/ai-stewardship` |
| Initial range | 2024-01-01 to present |
| Ongoing | Weekly ingest via `/api/cron/ingest-weekly` |
