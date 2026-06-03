# OpenAlex feed setup

OpenAlex uses the same ingest → Supabase → feed pipeline as PubMed. Articles are stored with `source = 'openalex'` and work IDs like `W2741809807` as `pmid`. The feed UI can switch between **PubMed** and **OpenAlex** with the **Source** control on `/feed`.

## 1. Get an OpenAlex API key (optional but recommended)

1. Sign in at [openalex.org](https://openalex.org/) and open your account / API settings.
2. Create an API key (premium pool: higher rate limits than the free polite pool).
3. You still need a **mailto** address on every request (OpenAlex policy), even with a key.

## 2. Environment variables

Add these locally in `.env.local` and in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Notes |
|----------|----------|--------|
| `OPENALEX_MAILTO` | Yes | Your email, e.g. `you@example.com` (polite pool + attribution) |
| `OPENALEX_API_KEY` | Recommended | Bearer token from OpenAlex; sent as `Authorization` and `api_key` |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same as PubMed ingest |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same as PubMed ingest |
| `OPENAI_API_KEY` | If summarizing | Required when `summarize=1` |

Example `.env.local`:

```env
OPENALEX_MAILTO=you@example.com
OPENALEX_API_KEY=your_openalex_api_key_here
```

## 3. Supabase migration

Run `scripts/add_openalex_ingest_state.sql` in the Supabase SQL Editor. It creates `openalex_ingest_state` and ensures `articles.source` exists.

## 4. Run OpenAlex ingest

**Local** (with `npm run dev`):

```bash
curl -X POST "http://localhost:3000/api/ingest/openalex?topicName=main&summarize=1&maxSummaries=10"
```

Or:

```bash
npx tsx scripts/run-openalex-ingest-now.ts
```

**Production** (`https://pubmedfeed.vercel.app`):

```bash
curl -X POST "https://pubmedfeed.vercel.app/api/ingest/openalex?topicName=main&summarize=1&maxSummaries=10"
```

Or:

```bash
set NEXT_PUBLIC_APP_URL=https://pubmedfeed.vercel.app
npx tsx scripts/run-openalex-ingest-now.ts
```

Query parameters (same spirit as PubMed ingest):

| Param | Description |
|-------|-------------|
| `topicName=main` | Default stewardship topic |
| `topicId=<uuid>` | Specific topic |
| `daysBack=30` | Override watermark; search last N days by **publication date** |
| `maxArticles=200` | Cap works fetched (max 500) |
| `summarize=1` | Generate summaries (needs OpenAI) |
| `maxSummaries=5` | Limit new summaries per run |

## 5. View the OpenAlex feed

Open the feed with the source query param:

- [https://pubmedfeed.vercel.app/feed?source=openalex](https://pubmedfeed.vercel.app/feed?source=openalex)

Or use the **Source → OpenAlex** toggle on the feed page after deploy.

## 6. Search query mapping

Topic `query_string` values are written for PubMed (MeSH, field tags). Ingest converts them to OpenAlex full-text search (quoted phrases and stripped MeSH). For better OpenAlex coverage you can later add a dedicated `openalex_query_string` column on `topics`; until then, a broad stewardship topic maps to phrases like `antimicrobial stewardship` / `antibiotic stewardship`.

## Troubleshooting

- **401 / 403 from OpenAlex**: Check `OPENALEX_API_KEY` and that the key is active.
- **Empty ingest**: Widen the window with `daysBack=90` or confirm `OPENALEX_MAILTO` is set.
- **Feed empty after ingest**: Confirm you selected **OpenAlex** as source; PubMed and OpenAlex rows are filtered separately.
- **Rate limits**: Use `OPENALEX_API_KEY`; reduce `maxArticles` per run.
