# Daily email digest

Automated daily pipeline:

1. **Ingest** PubMed + OpenAlex (main stewardship topic)
2. **Summarize** up to `DIGEST_MAX_SUMMARIES` new articles per source
3. **Email** recipients a digest of studies with **≥ 20% relevance** (configurable)

## 1. Resend (email)

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key

## 2. Environment variables (Vercel + `.env.local`)

| Variable | Required | Example |
|----------|----------|---------|
| `CRON_SECRET` | Yes | long random string |
| `RESEND_API_KEY` | Yes | `re_...` |
| `DIGEST_RECIPIENT_EMAILS` | Yes | `you@utoronto.ca,colleague@hospital.org` |
| `DIGEST_FROM_EMAIL` | Recommended | `ASP Feed <digest@yourdomain.com>` |
| `DIGEST_MIN_RELEVANCE` | No | `20` (default) |
| `DIGEST_MAX_SUMMARIES` | No | `20` per source per run |
| `DIGEST_HOURS_BACK` | No | `24` — look at summaries from this window |
| `DIGEST_SEND_IF_EMPTY` | No | `1` to email even when no items qualify |
| `OPENAI_API_KEY` | Yes | for summarization |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://pubmedfeed.vercel.app` |

Comma-, semicolon-, or space-separated emails are all accepted for recipients.

## 3. Schedule

**Vercel Cron** (in `vercel.json`):

```json
"path": "/api/cron/daily-digest",
"schedule": "0 10 * * *"
```

`0 10 * * *` = 10:00 UTC daily (~5–6 AM Eastern).

**Manual / cron-job.org:**

```
GET https://pubmedfeed.vercel.app/api/cron/daily-digest?secret=YOUR_CRON_SECRET
```

## 4. Test without waiting for cron

```bash
curl "https://pubmedfeed.vercel.app/api/cron/daily-digest?secret=YOUR_CRON_SECRET"
```

Response JSON includes ingest counts, digest items, and whether email was sent.

## 5. Relevance threshold

Relevance uses the same scoring as the feed admin panel (0–100 scale). **20%** is a low bar that includes most stewardship-tagged articles; raise `DIGEST_MIN_RELEVANCE` (e.g. `40` or `50`) for a shorter, higher-yield digest.

Admin priority ratings (1–10) also boost scores and improve future ranking via learned weights.
