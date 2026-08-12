# Daily ingest + Brief email

## Schedule (Eastern → UTC)

| Job | EDT | UTC cron | Route |
|-----|-----|----------|--------|
| PubMed ingest + summarize | 06:00, 17:00 | `0 10 * * *` / `0 21 * * *` | `/api/cron/daily-digest` |
| Stewardship Brief email | 07:00 | `0 11 * * *` | `/api/cron/brief-digest` |
| Priority model retrain check | 18:00 | `0 22 * * *` | `/api/cron/retrain-priority` (weekly gate) |

OpenAlex ingest is **off**. Legacy ASP Literature Feed emails are **retired** (no `DIGEST_SEND_LEGACY`, no abstract digests on the ingest cron).

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
```

## Keep Brief email out of spam (checklist)

1. **Resend → Domains** — verified SPF + DKIM for `stewardshipbrief.com`.
2. **`BRIEF_FROM_EMAIL`** on that domain (never `onboarding@resend.dev`). `/api/health/env` → `briefFromUsesOnboarding: false`.
3. **`DIGEST_REPLY_TO`** — a real inbox.
4. Resend → recent send → **Deliverability Insights**.
5. DMARC `_dmarc` TXT; tighten from `p=none` later if reports look clean.
6. Ask subscribers to mark **Not junk** and allowlist your From address.
7. Redeploy after From/header/body changes before the next 07:00 EDT Brief cron.
