# Daily email digest

- Up to **100** new summaries per source per day
- **Two separate emails**: `[PubMed]` and `[OpenAlex]`, each linking to its feed

## Minimum setup (one new variable)

You likely already have these on Vercel:

| Variable | You probably have it? |
|----------|------------------------|
| `NCBI_EMAIL` | Yes → digest recipient (same email PubMed ingest uses) |
| `OPENALEX_MAILTO` | Yes → OpenAlex API only (not used for digest if `NCBI_EMAIL` is set) |
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

No need for `DIGEST_RECIPIENT_EMAILS` if `NCBI_EMAIL` is already set. On Resend’s free tier, set `DIGEST_RECIPIENT_EMAILS` to your Gmail if `NCBI_EMAIL` is a non-Gmail address.

### Optional overrides

| Variable | When to use |
|----------|-------------|
| `DIGEST_RECIPIENT_EMAILS` | Extra recipients: `you@x.com,colleague@y.com` |
| `DIGEST_FROM_EMAIL` | After you verify a domain in Resend |
| `DIGEST_MAX_SUMMARIES` | Default **100** per source per run |

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

### Troubleshooting `Unauthorized`

| Response | Meaning |
|----------|---------|
| `Invalid secret` (401) | `CRON_SECRET` in the URL does not match Vercel. Copy the value from **Settings → Environment Variables**, redeploy, try again. |
| `CRON_SECRET is not set` (503) | Variable missing on this deployment — add it for **Production**, redeploy. |
| `Unauthorized` (500) with a `pubmedfeed-….vercel.app/api/ingest` URL | **Cron auth passed.** Vercel Deployment Protection blocked an internal HTTP call. Fixed by calling ingest in-process — redeploy the latest code. |

Check env vars loaded on production:

```
https://pubmedfeed.vercel.app/api/health/env
```

Look for `"CRON_SECRET": true`. If it is `false`, see below.

### Vercel shows an empty value for CRON_SECRET

That is normal in the dashboard — **Vercel hides secret values after you save**. An empty-looking field does not mean it was deleted.

When **editing** a variable, the value box is often blank. If you click **Save** without pasting the secret again, you can **wipe** the value. Always re-paste the full secret when editing.

After any env change:

1. **Key** must be exactly `CRON_SECRET` (no spaces).
2. Check **Production** (not Preview only).
3. Open the project that owns **pubmedfeed.vercel.app** (Settings → Domains).
4. **Redeploy**: Deployments → latest → ⋮ → **Redeploy** (do not use “Redeploy without env” if offered).
5. Wait for “Ready”, then reload `/api/health/env`.

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

(This overrides the `NCBI_EMAIL` default.)
