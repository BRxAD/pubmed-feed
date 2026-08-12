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

## Schedule (fixed EDT → UTC)

Vercel Cron uses UTC only. These times are locked to **Eastern Daylight Time**
(will be one hour early in winter EST unless adjusted):

| Job | EDT | UTC cron |
|-----|-----|----------|
| PubMed ingest + summarize | 06:00, 12:00, 17:00 | `0 10 * * *`, `0 16 * * *`, `0 21 * * *` → `/api/cron/daily-digest` |
| Stewardship Brief email | 07:00 | `0 11 * * *` → `/api/cron/brief-digest` |

OpenAlex ingest is **off** on these digest runs. Homepage lead story is sticky for the Eastern calendar day (see `lib/brief/leadStory.ts`); email ranking is live, not sticky.

## Test now

Ingest only:

```
https://pubmedfeed.vercel.app/api/cron/daily-digest?secret=YOUR_CRON_SECRET
```

Brief email only:

```
https://pubmedfeed.vercel.app/api/cron/brief-digest?secret=YOUR_CRON_SECRET
```

Response shows ingest results (digest) or whether the brief email was sent.

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

## Keep Brief email out of spam (checklist)

Auth for `stewardshipbrief.com` is mostly in place (Resend DKIM + `send.` SPF/MX + DMARC `p=none`). Still check Resend and habits:

1. **Resend → Domains** — `stewardshipbrief.com` (or `send.`) shows **Verified** (SPF + DKIM green).
2. **`BRIEF_FROM_EMAIL`** — must be on that verified domain, e.g. `The Stewardship Brief <brief@stewardshipbrief.com>` (never `onboarding@resend.dev`). Confirm via `/api/health/env` → `briefFromUsesOnboarding: false`.
3. **`DIGEST_REPLY_TO`** — a real inbox people can answer (already preferred).
4. **Resend → Emails → open a recent Brief send → Deliverability Insights** — fix any warnings (DMARC, off-domain links, missing text).
5. **DMARC** — keep `_dmarc` TXT; after reports look clean, consider tightening from `p=none` to `p=quarantine` (optional; ask first if unsure).
6. **Ask subscribers** — mark one message **Not junk / Not spam**, and allowlist `brief@stewardshipbrief.com` (or whatever From you use). Institutional filters often need IT allowlisting.
7. **Warm reputation** — new domains land in junk more often; consistent daily sends with low bounce/complaint rates improve placement over 1–2 weeks.
8. After code changes that affect From/headers/body, **redeploy** before the next 07:00 EDT Brief cron.
