---
name: stewardship-brief-conventions
description: >-
  Product conventions for The Stewardship Brief / pubmed-feed (Next.js + Supabase):
  plain-language mental model, how to talk to the user, Brief/feed/dashboard/ingest
  rules, egress, embeddings lifecycle, Postgres indexes/RLS, PubMed-only, and hard
  change-control. Use when working on Brief, homepage, /feed, /dashboard, ingest,
  cron, summaries, ranking, priority ML, embeddings, settings, Supabase, or related
  API routes.
---

# Stewardship Brief — product conventions

Apply these when changing Brief, feed, dashboard, ingest, ranking, or Supabase access.

## How to talk to the user (hard)

- Keep replies **brief** and **clear to a novice**.
- Prefer short plain sentences; avoid jargon, or define it in one everyday phrase.
- Lead with the answer; skip long background unless asked.
- When something needs the user to act (e.g. run SQL), say exactly what and where.

## Plain-language mental model (read this first)

Think of the product like a newspaper desk:

1. **Ingest (the night shift)** — New PubMed papers arrive. We write a short summary, compute relevance (`rank_score`), and give a **priority grade 1–10** (`ml_priority`) using the smart model **including embeddings**. Saved **once** on the summary row.
2. **Your rating (editor override)** — Human `admin_priority` always wins over the machine grade.
3. **Homepage / Brief** — Show strong stories (priority ≥ **5**) from the last **28** days. Do **not** re-run embeddings per visitor. Read saved grades.
4. **Top 10** — Last **365** days, but only **scan** saved priority ≥ **6**. No re-embedding.
5. **Retrain** — Rebuilds the grading rubric from your ratings + embeddings. Improves **future** ingest only — does **not** rewrite old `ml_priority` unless you ask.

### Words we use

| Word | Simple meaning |
|------|----------------|
| **Embedding** | Numeric “meaning fingerprint” of title+abstract. Useful once; **huge** to re-download. |
| **First rating** | One-time machine grade at ingest → `ml_priority`. |
| **Handcrafted features** | Simpler signals without embeddings. OK for **old** rows lacking `ml_priority`. |
| **Slim** | Fetch small fields first (title, dates, scores) — not long text. |
| **Hydrate** | After picking winners, fetch long text **only for those**. |
| **Egress** | Bytes leaving Supabase (free plan has a monthly cap). |
| **Train ≠ serve** | Better model (train) is incomplete until ingest **saves** a grade (serve). |

### Brief load in three steps (required)

1. **Slim pass** — Candidates without abstract / `summary_text` bodies.
2. **Gate** — Keep saved priority ≥ 5. Legacy null `ml_priority`: handcrafted OK.
3. **Hydrate survivors** — Bodies only for homepage/digest winners. Top 10 skips body hydrate.

### What we will not do

- Re-download embedding JSON on Brief/feed/dashboard visits.
- Backfill re-grade all old articles unless asked.
- Change Brief ≥5 / Top 10 ≥6 / date windows without asking.
- Commit/push unless the user asks.
- Re-enable OpenAlex.

---

## Applied in Supabase (confirmed)

| Script | Status |
|--------|--------|
| `scripts/add_ml_priority.sql` | **Applied** |
| `scripts/optimize_postgres_hot_paths.sql` | **Applied** (indexes + RLS on core tables; ASCII-only comments) |
| `scripts/fix_topic_query_animals_not_humans.sql` | **Applied** (main topic animal filter) |

New environments: run these in the Supabase SQL Editor. SQL comments must stay **ASCII-only** (no fancy dashes) — Supabase editor can choke on unicode.

## Ask before changing (hard)

Do **not** change without explicit user approval:

- Brief min priority (`BRIEF_MIN_PRIORITY` = **5**)
- Top 10 scan floor (`TOP_PRIORITY_MIN_PRIORITY` = **6**)
- Brief window (**28** days) or Top 10 window (**365** days)
- Ingest / digest cron or timezone assumptions
- Priority model version / feature schema (**v5** ridge + PCA-8)
- Public branding / marketing copy
- Schema migrations / destructive SQL / RLS that **opens** public access

Also: **do not commit or push** unless the user asks.

## Canonical constants

| Concept | Value | Source |
|--------|--------|--------|
| Brief eligibility | effective priority ≥ **5** | `lib/brief/priority.ts` |
| Brief article window | **28** days | `BRIEF_ARTICLE_WINDOW_DAYS` |
| Top 10 window | **365** days | `TOP_PRIORITY_ARTICLE_WINDOW_DAYS` |
| Top 10 scan floor | stored priority ≥ **6** | `TOP_PRIORITY_MIN_PRIORITY` |
| Dashboard default range | last **28** days | `lib/dashboard.ts` |
| Priority model | **v5** ridge + PCA-8 | `lib/brief/priorityModel.ts` |
| Timezone | **America/New_York** | UI, lead story |
| Ingest slots (Eastern) | **06:00 / 12:00 / 17:00** → UTC **10 / 16 / 21** | `vercel.json`, dashboard |

**Effective priority:** `admin_priority` → else `ml_priority` → else handcrafted live predict (legacy only).

## Embeddings & ML priority (hard)

| When | Embeddings? |
|------|-------------|
| **Ingest first rating** | **Yes** — `scoreFirstMlPriorities` → `summaries.ml_priority` |
| **Page load** | **No** — read `ml_priority` |
| **Retrain** | **Yes** — fit model only |

Helpers: `lib/brief/firstRating.ts`. No backfill unless asked. Retrain does not re-score old rows.

**Canonical ML score = stored `ml_priority` only** (handcrafted + embeddings at ingest). Never treat a page-load recompute without embeddings as the ML grade — that number can disagree and mislead (e.g. Brief gated on stored 5 while Admin showed live 4).

**Feed Admin UI:** show stored `ml_priority` as “ML (ingest)”. Feature breakdown may run without embeddings as a sketch only — label it clearly; do not present its total as the ML score.

## PubMed topic query (hard)

Main topic animal exclusion must be:

`(animals[MeSH] NOT humans[MeSH])`

**Never** bare `NOT animals[MeSH]`. In MeSH, Humans sits under Animals, so the bare form drops almost all MEDLINE human clinical papers. Keep case-report exclusion as before. Script: `scripts/fix_topic_query_animals_not_humans.sql`.

## Surfaces

- **PubMed only.** OpenAlex ingest → **410**. `parseFeedSource` always `pubmed`. No source switcher.
- **Brief** — curated, ≥5, 28-day window.
- **`/feed`** — PubMed browser; default sort ingested; slim index + SQL page for default browse. Admin ML badge = stored `ml_priority`.
- **`/dashboard`** — date-range analytics; Top 10 shares homepage ranker.
- **SEO** — `/feed` + `/dashboard` **noindex**; `robots.ts` disallows tools. Brief/marketing stay indexable.
- Tab titles start with **Dashboard** / **Feed**; distinct route icons.

## Data fetching & egress (hard)

1. Never bulk-select `abstract`, `summary_text`, or embedding JSON for the whole corpus on page load.
2. Slim + hydrate (feed pages ≤ ~100; Brief survivors only; dashboard **no** abstracts).
3. Brief: slim → gate → hydrate (`lib/brief/items.ts`).
4. Default `/feed`: SQL pagination — no full-corpus walk.
5. Filters/relevance: cached slim index (`feed-slim-index`, ~10 min); bust on ingest + admin rating.
6. Cache Brief (`brief-homepage` ~10 min) + Top 10 (`brief-top-priority` ~15 min); bust same way.
7. Dashboard: date-scoped slim, cap ~1500.
8. Ingest: write `rank_score` + `ml_priority`; service role; RLS with no anon policies.
9. Indexes/RLS: keep `optimize_postgres_hot_paths.sql` applied; re-run after new filter columns.
10. Prefer API URL (`*.supabase.co`) for supabase-js — not direct Postgres port 5432 from serverless.

## Current state (done)

- Egress cuts: no web embedding reads; Brief cache; dashboard slim + date filter; Brief slim→gate→hydrate.
- Ingest-time `ml_priority` with embeddings.
- Feed Admin shows stored `ml_priority` (not live no-embedding recompute).
- Main topic query uses `(animals[MeSH] NOT humans[MeSH])`.
- Top 10 SQL prefilter ≥ 6.
- PubMed-only (OpenAlex UI + ingest disabled).
- CI smoke: OpenAlex expects **410**; PubMed feed + homepage **200**; Actions on Node 24 (`checkout`/`setup-node` v5).
- Hot-path indexes + RLS applied in Supabase.

## Still open (optional later)

- Embeddings still stored as big JSON in `app_settings` — longer-term: dedicated table or drop after scoring.
- Optional SEO: `metadataBase` / OG cleanup on public pages.
- Shrinking Top 10’s 365-day window — **ask first**.
- No surprise backfills or bulk recompute scripts without go-ahead.

## Ranking & settings

- Prefer stored `rank_score` for relevance sort when present.
- Settings multi-label (`lib/classifySetting.ts`); ED → hospital **and** community; admin override = one label.
- **Admin setting is exclusive:** when `admin_setting` is set, filters/display use only that label — never soft-match the article into another Brief capsule.
- Brief filter bar is a reduced set — don’t silently drop classifier labels.
- **Story images stick across setting tabs:** assign photos on the full All pool, then filter; same PMID keeps the same image on Hospital / Outpatient / One Health.

## Ingest & cron

- `/api/cron/daily-digest` (+ GitHub Actions). Auth: `CRON_SECRET`.
- Show times in **Eastern**.
- “Newly summarized” = new summary PMIDs in that ingest window — not “ML ≥ 5”.
- New summary → embed once → save `ml_priority`.
- Topic `query_string` animal filter: `(animals[MeSH] NOT humans[MeSH])` — see PubMed topic query section.

## UI / UX (soft)

- Keep existing Brief/feed look; avoid generic AI aesthetics.
- One job per section; don’t turn Brief into a dashboard.

## Implementation checklist

- [ ] Thresholds/windows/cron/model untouched (or approved)
- [ ] No full-corpus abstract / embedding egress on hot paths
- [ ] Embeddings only at ingest + retrain
- [ ] UI “ML” = stored `ml_priority` (not page-load no-embedding score)
- [ ] Topic query uses animals NOT humans (not bare animals)
- [ ] Brief slim → gate → hydrate; Top 10 no body hydrate
- [ ] Durable write + cheap read for new ML work
- [ ] PubMed-only preserved
- [ ] Cache tags busted on ingest / admin rating
- [ ] Dashboard Top 10 shares homepage ranker
- [ ] Eastern times where “day” matters
- [ ] SQL called out; ASCII-only in SQL comments
- [ ] User-facing reply stays brief and novice-clear
- [ ] Commit/push only if user asked
