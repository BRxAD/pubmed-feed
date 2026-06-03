# Daily ingest at 5 AM EST

The app exposes a cron endpoint that runs ingest for the default topic (antimicrobial stewardship). Use any cron service to call it daily at 5 AM Eastern.

## 1. Set the secret

Add to your environment (e.g. `.env.local` and your host’s env):

```bash
CRON_SECRET=your-random-secret-here
```

Generate a long random string (e.g. `openssl rand -hex 24`).

## 2. Endpoint

- **URL:** `GET https://YOUR_DOMAIN/api/cron/ingest?secret=YOUR_CRON_SECRET`
- **Example (production):** `https://your-app.vercel.app/api/cron/ingest?secret=abc123...`
- **Example (local):** `http://localhost:3000/api/cron/ingest?secret=abc123...`

The route accepts either:

- Query: `?secret=YOUR_CRON_SECRET`
- Header: `Authorization: Bearer YOUR_CRON_SECRET` (for Vercel Cron)

It then looks up the default topic and runs ingest (same as `POST /api/ingest` with that topic).

## 3. Schedule at 5 AM EST

### Option A: cron-job.org (free)

1. Sign up at [cron-job.org](https://cron-job.org).
2. Create a new cron job.
3. **URL:** `https://YOUR_DOMAIN/api/cron/ingest?secret=YOUR_CRON_SECRET`
4. **Schedule:** Daily at 5:00 AM. Set timezone to **America/New_York** (EST/EDT).
5. Method: **GET**. Save.

### Option B: Vercel Cron (if deployed on Vercel)

1. Add `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 10 * * *"
    }
  ]
}
```

2. Vercel Cron uses **UTC**. 5 AM EST = 10:00 UTC (winter); 5 AM EDT = 9:00 UTC (summer). `0 10 * * *` = 10:00 UTC daily (5 AM EST in winter; 6 AM EDT in summer).
3. In Vercel project settings, add env **CRON_SECRET** and configure the cron to send **Authorization: Bearer YOUR_CRON_SECRET** (or use an env var in the cron config if supported).

---

## Run ingest now (manual)

To run ingest immediately (e.g. to pull new articles without waiting for the 5 AM run):

1. **Start the dev server** (if not already): `npm run dev`
2. **Trigger ingest:** `npm run ingest:now`

This script calls `/api/health/supabase` to get the default topic id, then `POST /api/ingest` with that id. The daily 5 AM cron is unchanged.

**Alternative (with CRON_SECRET):**  
`GET http://localhost:3000/api/cron/ingest?secret=YOUR_CRON_SECRET` (browser or curl).

---

## Weekly ingest (AI + antimicrobial stewardship)

A second topic **“Antimicrobial stewardship and artificial intelligence”** has its own feed and weekly ingest:

- **Feed:** `/feed/ai-stewardship`
- **Cron:** `GET https://YOUR_DOMAIN/api/cron/ingest-weekly?secret=YOUR_CRON_SECRET` (same CRON_SECRET)
- **Schedule:** Weekly (e.g. Sunday 6 AM). Initial backfill Jan 2024–present is one-time; see **docs/FEED_AI_STEWARDSHIP.md**.
