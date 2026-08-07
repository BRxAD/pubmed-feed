---
name: stewardship-brief-conventions
description: >-
  Product conventions for The Stewardship Brief / pubmed-feed (Next.js + Supabase):
  Brief eligibility, date windows, Eastern cron/ingest times, feed/dashboard fetch
  and egress rules, ranking/priority model, multi-label settings, and hard
  change-control. Use when working on Brief, homepage, /feed, /dashboard, ingest,
  cron, summaries, ranking, priority ML, embeddings, settings classification,
  Supabase queries, or related API routes.
---

# Stewardship Brief — product conventions

Apply these when changing Brief, feed, dashboard, ingest, ranking, or Supabase access.

## Ask before changing (hard)

Do **not** change without explicit user approval:

- Brief min priority threshold (`BRIEF_MIN_PRIORITY`, currently **5**)
- Brief article window (**28** days) or Top 10 window (**365** days)
- Ingest / digest cron schedule or timezone assumptions
- Priority model version / feature schema (currently **v5** ridge + PCA-8)
- Public branding, product name, or user-facing marketing copy
- Schema migrations / destructive SQL / RLS policy rewrites that open public access

Also: **do not commit or push** unless the user asks.

## Canonical constants

| Concept | Value | Source of truth |
|--------|--------|-----------------|
| Brief eligibility | effective priority ≥ **5** | `lib/brief/priority.ts` → `BRIEF_MIN_PRIORITY` |
| Brief article window | **28** days (release/pub date) | `BRIEF_ARTICLE_WINDOW_DAYS` |
| Top 10 window | **365** days | `lib/brief/topPriority.ts` → `TOP_PRIORITY_ARTICLE_WINDOW_DAYS` |
| Dashboard default range | last **28** days | `lib/dashboard.ts` → `defaultDashboardRange` |
| Priority model | version **5**, `ridge_regression` | `lib/brief/priorityModel.ts` |
| Timezone for display / “day” | **America/New_York** (Eastern) | UI formatters, lead story |
| Ingest slots (Eastern) | **06:00 / 12:00 / 17:00** → UTC **10 / 16 / 21** | `vercel.json`, `lib/dashboard.ts` |

Effective priority: human `admin_priority` wins over ML when set.

## Surfaces

- **Brief (homepage / email):** curated, priority-gated, 28-day article window; not a raw dump of `/feed`.
- **`/feed`:** full corpus browser; default sort = ingested; filters/relevance may use cached slim index.
- **`/dashboard`:** analytics for selected article-date range; Top 10 must use same ranker as homepage (`getRankedTopPriorityItems` / `rankTopPriorityItems`).

Tab titles: start with **Dashboard** / **Feed** so the browser tab is obvious. Distinct route icons under `app/dashboard/icon.svg` and `app/feed/icon.svg`.

## Data fetching & egress (hard)

Supabase free-tier egress and statement timeouts are real constraints.

1. **Never** bulk-select `abstract`, `summary_text`, or huge JSON (embedding cache) for the whole corpus on page load.
2. **Slim bulk + hydrate:** list/index paths use slim columns (`lib/feedSelect.ts`); hydrate abstract/summary only for small pages (≤ ~100 rows) or explicit in-range dashboard scoring.
3. **Default `/feed` browse** (ingested, no filters, small page): SQL pagination (`fetchIngestedPage`) — do not walk the full corpus.
4. **Filters / relevance / published / dashboard bulk:** use cached slim index (`lib/feedCache.ts`, tag `feed-slim-index`, ~10 min); bust on ingest and admin priority changes.
5. **Dashboard:** no embedding-cache reads for histograms; handcrafted features (+ null embedding) unless user asks otherwise.
6. **Ingest:** write `rank_score` on summary upsert; prefer service role; RLS on watermark tables with no anon policies.

If a change reintroduces full-corpus abstract pulls or parallel giant joins, stop and redesign.

## Ranking & settings

- Relevance display on cards may recompute live; **sort-by-relevance** should prefer stored `rank_score` when enough rows have it (ingest/backfill via `computeStoredRankScore` / `npm run recompute:rank-scores`).
- Settings are **multi-label** rules in `lib/classifySetting.ts` (hospital, community, long-term care, dentistry, one-health, global-health, animal, environment). ED terms score hospital **and** community. Admin override wins as a single label.
- Brief filter bar is a reduced set (e.g. All · Hospital · Outpatient · One Health / Global) — do not silently remove labels from the classifier when editing the bar.

## Ingest & cron

- Primary digest: `/api/cron/daily-digest` (also GitHub Actions). Auth via `CRON_SECRET`.
- Display last/next ingest in **Eastern**; label times as Eastern when showing status.
- Last-ingest “newly summarized” = distinct PMIDs summarized in that ingest window — not “ML ≥ 5”.

## UI / UX (soft — prefer)

- Follow existing Brief / feed visual language; avoid generic AI aesthetics (purple gradients, cream+terracotta clichés, glow pills, emoji clutter).
- Prefer one job per section; don’t turn the Brief into a dashboard.
- Cards only when they aid interaction; keep motion intentional and sparse.
- Preserve brand strength on promotional/Brief surfaces (brand first, not nav-only).

## Implementation checklist

Before finishing a change in this domain:

- [ ] Thresholds/windows/cron/model untouched (or user approved)
- [ ] No full-corpus abstract / embedding-cache egress on hot paths
- [ ] Feed default path still SQL-paginated when unfiltered
- [ ] Cache tags revalidated on ingest / admin rating when index changes
- [ ] Dashboard Top 10 still shares homepage ranker
- [ ] Times shown to users remain Eastern where ingest/Brief “day” matters
