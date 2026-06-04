# Daily email digest

Sends you a daily email of new stewardship studies **≥ 20% relevance** after ingest + summarize.

## Minimum setup (one new variable)

You likely already have these on Vercel:

| Variable | You probably have it? |
|----------|------------------------|
| `OPENALEX_MAILTO` | Yes → **`brad.langford@utoronto.ca`** becomes digest recipient |
| `OPENAI_API_KEY` | Yes → summaries |
| `CRON_SECRET` | Set once for secured cron |
| `NEXT_PUBLIC_APP_URL` | Yes → `https://pubmedfeed.vercel.app` |

**Only add this one new variable:**

| Variable | Value |
|----------|--------|
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) (free tier) |

1. Sign up at Resend → **API Keys** → Create
2. Vercel → **Settings → Environment Variables** → add `RESEND_API_KEY`
3. Redeploy

No need for `DIGEST_RECIPIENT_EMAILS` if `OPENALEX_MAILTO=brad.langford@utoronto.ca` is already set.

### Optional overrides

| Variable | When to use |
|----------|-------------|
| `DIGEST_RECIPIENT_EMAILS` | Extra recipients: `you@x.com,colleague@y.com` |
| `DIGEST_FROM_EMAIL` | After you verify a domain in Resend |
| `DIGEST_MIN_RELEVANCE` | Default `20`; try `40` for a shorter digest |

## Schedule: 7 AM Eastern

Vercel cron runs at **11:00 UTC** daily (`0 11 * * *`):

- **7 AM** during daylight time (EDT, roughly Mar–Nov)
- **6 AM** during standard time (EST, roughly Nov–Mar)

Exact offset depends on your province/state; adjust in `vercel.json` if needed (`0 12 * * *` = 7 AM EST / 8 AM EDT).

## Test now

```
https://pubmedfeed.vercel.app/api/cron/daily-digest?secret=YOUR_CRON_SECRET
```

Response shows ingest results, digest items, and whether email was sent.

## What the email contains

For each qualifying study (last 24 hours, ≥ 20% relevance):

- Title (linked to PubMed / OpenAlex)
- Journal, date, relevance %
- Methods, Results, Bottom line from the AI summary
- Link to full feed

Emails are skipped if nothing qualifies (unless `DIGEST_SEND_IF_EMPTY=1`).

## Add colleagues later

Set on Vercel:

```
DIGEST_RECIPIENT_EMAILS=brad.langford@utoronto.ca,colleague@hospital.org
```

(This overrides the `OPENALEX_MAILTO`-only default.)
