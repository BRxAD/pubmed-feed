# Daily ingest + Brief email

## Schedule (Eastern → UTC)

| Job | EDT | UTC cron | Route |
|-----|-----|----------|--------|
| PubMed ingest + summarize | 06:00, 17:00 | `0 10 * * *` / `0 21 * * *` | `/api/cron/daily-digest` |
| Stewardship Brief email | 08:30 | `30 12 * * *` | `/api/cron/brief-digest` |
| Author recognition emails (human 5+) | 17:30 | `30 21 * * *` | `/api/cron/author-outreach` |
| Priority model retrain check | 18:00 | `0 22 * * *` | `/api/cron/retrain-priority` (weekly gate) |

OpenAlex ingest is **off**. Legacy ASP Literature Feed emails are **retired** (no `DIGEST_SEND_LEGACY`, no abstract digests on the ingest cron).

Scheduled ingest is **Vercel Cron only**. The GitHub `daily-ingest` workflow is manual (`workflow_dispatch`) so it cannot double-fire and overwrite a productive run.

## Env (Vercel)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Send Brief email |
| `BRIEF_FROM_EMAIL` | Verified domain, e.g. `The Stewardship Brief <brief@stewardshipbrief.com>` |
| `DIGEST_REPLY_TO` / `NCBI_EMAIL` | Reply-To for Brief mail |
| `DIGEST_RECIPIENT_EMAILS` | Optional admin recipients added to Brief subscribers |
| `CRON_SECRET` | Secure cron routes |
| `DIGEST_MAX_SUMMARIES` | Cap per ingest pass (default 40) |
| `BRIEF_DIGEST_SEND_IF_EMPTY` | Set `1` to email even when no new headlines |

## Test

```
https://YOUR_HOST/api/cron/daily-digest?secret=YOUR_CRON_SECRET
https://YOUR_HOST/api/cron/brief-digest?secret=YOUR_CRON_SECRET
https://YOUR_HOST/api/cron/author-outreach?secret=YOUR_CRON_SECRET
```

## Keep Brief email out of spam (checklist)

1. **Resend → Domains** — verified SPF + DKIM for `stewardshipbrief.com`.
2. **`BRIEF_FROM_EMAIL`** on that domain (never `onboarding@resend.dev`). `/api/health/env` → `briefFromUsesOnboarding: false`.
3. **`DIGEST_REPLY_TO`** — a real inbox.
4. Resend → recent send → **Deliverability Insights**.
5. DMARC `_dmarc` TXT; tighten from `p=none` later if reports look clean.
6. Ask subscribers to mark **Not junk** and allowlist your From address.
7. Redeploy after From/header/body changes before the next 08:30 EDT Brief cron.

## Author recognition emails (human rating 5+)

When an editor first rates a paper **5 or higher**, a corresponding-author draft is queued (going forward only; no historical backfill). Review or hold drafts on `/email_preview`. Unheld drafts send via Resend at **17:30 Eastern** (cap 25/night). Opt-out is a separate list from Brief subscribers.

**You must run** `scripts/add_author_outreach.sql` in the Supabase SQL Editor before this can store emails or send.

### Domain health (same Resend domain as Brief)

SPF / DKIM / DMARC cannot be set from this repo. In Resend → Domains for `stewardshipbrief.com`:

1. SPF + DKIM verified (same as Brief mail above).
2. DMARC `_dmarc` TXT present (`p=none` is fine at first).
3. From address is `BRIEF_FROM_EMAIL` on that domain, never `onboarding@resend.dev`.
