# Topic queries and ingest

- **Main feed**: Uses **MeSH only** (`"Antimicrobial Stewardship"[MeSH]`) to keep the result set smaller and avoid fetch/timeouts. Daily ingest runs for the last 7 days, up to 500 articles.
- **AI feed**: Uses the **broad** search (MeSH + Title/Abstract for stewardship and AI). Ingest runs for the last year, up to 1000 articles.

## 1. Set topic queries in Supabase

- **Main feed (MeSH only):** Run **`scripts/update_topic_query_main_mesh_only.sql`** so the main topic uses `"Antimicrobial Stewardship"[MeSH]` only.
- **AI feed (broad):** Run **`scripts/update_topic_queries_broad.sql`** so the AI topic keeps the broad MeSH + Title/Abstract `query_string` (or use `docs/SUPABASE_SCHEMA_FIXED.sql` if setting up from scratch).

## 2. Main feed (antimicrobial / antibiotic stewardship)

With the dev server running (`npm run dev`):

```bash
npm run ingest:now
```

Or call the API (use the topic id from `GET /api/health/supabase`):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"topicId\":\"YOUR_MAIN_TOPIC_UUID\"}"
```

This uses the main topic’s `query_string` (MeSH only). **First time:** pass `daysBack: 365` to pull up to 500 articles from the last year. **Daily:** omit it to use the last 7 days only.

First-time (1 year, 500 articles):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"topicId\":\"YOUR_MAIN_TOPIC_UUID\",\"daysBack\":365}"
```

Daily (7 days, 500 articles): `npm run ingest:now` or same with no `daysBack`.

**To backfill the main feed** with more past articles (e.g. last 90 days), call the API with a date range and the **main** topic id (from `GET /api/health/supabase`, use the topic whose name does *not* include “artificial intelligence”):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"topicId\":\"YOUR_MAIN_TOPIC_UUID\",\"mindate\":\"2024-11-01\",\"maxdate\":\"2025-02-21\"}"
```

Use your desired `mindate`/`maxdate` (YYYY-MM-DD). Up to 1000 articles per run.

## 3. AI feed (stewardship + artificial intelligence)

With the dev server running:

```bash
npm run ingest:ai-stewardship
```

Or call the API with the AI topic id and optional date range (Jan 2024–present):

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"topicId\":\"YOUR_AI_TOPIC_UUID\",\"mindate\":\"2024-01-01\",\"maxdate\":\"2025-03-21\"}"
```

Use today’s date for `maxdate` (YYYY-MM-DD). This backfill can take several minutes (up to 500 articles). After that, weekly ingest will add new articles (no need to pass mindate/maxdate for the weekly job).

## 4. Check results

- Main feed: **http://localhost:3000/feed**
- AI feed: **http://localhost:3000/feed/ai-stewardship**

You should see more articles (e.g. “antibiotic stewardship” in title/abstract, or “artificial intelligence” as keyword) once ingest has run with the new search.
