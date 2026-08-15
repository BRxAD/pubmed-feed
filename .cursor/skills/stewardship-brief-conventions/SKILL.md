---
name: stewardship-brief-conventions
description: >-
  Product conventions for The Stewardship Brief / pubmed-feed (Next.js + Supabase):
  plain-language mental model, how to talk to the user, Brief/feed/ingest
  rules, egress, embeddings lifecycle, story images, admin setting overrides,
  summary/headline voice (ID/AMS experts, cautious claims), Postgres indexes/RLS,
  PubMed-only, and hard change-control. Use when working on Brief, homepage,
  /feed, ingest, cron, summaries, headlines, ranking, priority ML, embeddings,
  story images, settings, Supabase, or related API routes.
---

# Stewardship Brief — product conventions

Apply these when changing Brief, feed, ingest, ranking, summaries/headlines, or Supabase access.
This file is the source of truth — overwrite older convention notes that conflict.

## How to talk to the user (hard)

- Keep replies **brief** and **clear to a novice**.
- Prefer short plain sentences; avoid jargon, or define it in one everyday phrase.
- Lead with the answer; skip long background unless asked.
- When something needs the user to act (e.g. run SQL), say exactly what and where.
- **Warn before any change that would add substantial Supabase egress or data use** (bulk abstracts, embedding JSON, full-corpus walks, large JSON settings reads). Propose a slim alternative; do not ship the heavy path unless the user explicitly accepts the cost.

## Plain-language mental model (read this first)

Think of the product like a newspaper desk:

1. **Ingest (the night shift)** — New PubMed papers arrive. We write a short summary + headline, compute relevance (`rank_score`), save **care-setting labels** (`auto_settings`), and give a **priority grade 1–10** (`ml_priority`) using the smart model **including embeddings**. Saved **once** on the summary row. Stamp `fetched_at` on **first insert only**; refreshes must keep the original stamp.
2. **Your rating (editor override)** — Human `admin_priority` always wins over the machine grade. Human `admin_setting` always wins over auto multi-label settings (exclusive — one label only). Brief/Top 10 use **effective** priority, so an admin 4 hides an ML 5/6.
3. **Homepage / Brief** — Show strong stories (effective priority ≥ **5**) from the last **28** days by **article date**. Default order: **prefer newest published, else newest ingest** (`max(publish, fetched_at)`), then priority. Do **not** re-run embeddings per visitor. Read saved grades + saved settings. Story photos are assigned on the **All** pool so they stay the same across setting tabs. Sticky lead pins the day’s #1 against *lower*-priority churn only.
4. **Top 10** — Last **365** days, but only **scan** saved priority ≥ **6**. Rank: highest effective priority, human-rated before ML-only on ties. No re-embedding. Cached as one **All** pool; setting tabs filter in memory.
5. **Retrain** — Rebuilds the grading rubric from your ratings + embeddings on a **weekly** schedule (not every rating). Improves **future** ingest only — does **not** rewrite old `ml_priority` unless you ask. Manual force: `npm run retrain:priority` or cron `?force=1`.

### Words we use

| Word | Simple meaning |
|------|----------------|
| **Embedding** | Numeric “meaning fingerprint” of title+abstract. Useful once; **huge** to re-download. |
| **First rating** | One-time machine grade at ingest → `ml_priority`. |
| **auto_settings** | Care-setting labels saved at ingest so page loads need not re-read keywords/MeSH to classify. |
| **Handcrafted features** | Simpler signals without embeddings. OK for **old** rows lacking `ml_priority`. |
| **Slim** | Fetch small fields first (title, dates, scores, `auto_settings`) — not long text or keyword/MeSH arrays. |
| **Hydrate** | After picking winners, fetch long text / keywords / MeSH **only for those**. |
| **Egress** | Bytes leaving Supabase (free plan has a monthly cap). |
| **Train ≠ serve** | Better model (train) is incomplete until ingest **saves** a grade (serve). |
| **Effective priority** | `admin_priority` if set, else `ml_priority`, else legacy handcrafted. |

### Brief load in three steps (required)

1. **Slim pass** — Candidates without abstract / `summary_text` / keywords / MeSH bodies; include `auto_settings`.
2. **Gate** — Keep **effective** priority ≥ 5. Legacy null `ml_priority`: handcrafted OK. Admin override can exclude an ML ≥ 5 paper.
3. **Hydrate survivors** — Bodies (+ keywords/MeSH for images) only for homepage/digest winners. Top 10 skips body hydrate (may still page-hydrate keywords for soft setting match).

### What we will not do

- Re-download embedding JSON on Brief/feed visits.
- Revive `/dashboard` analytics (retired for egress) without an explicit ask.
- Bulk-select keywords/MeSH (or abstracts) for the whole corpus on page load when `auto_settings` / slim+hydrate will do.
- Bust Top 10 or the feed slim index on every admin rating (Brief homepage only).
- Backfill re-grade all old articles unless asked.
- Regenerate existing summaries/headlines unless asked (new prompts apply **going forward**).
- Change Brief ≥5 / Top 10 ≥6 / date windows without asking.
- Commit/push unless the user asks.
- Re-enable OpenAlex.

---

## Applied in Supabase (confirmed)

| Script | Status |
|--------|--------|
| `scripts/add_ml_priority.sql` | **Applied** |
| `scripts/add_auto_settings.sql` | **Applied** (GIN on `auto_settings`) |
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
| Brief eligibility | **effective** priority ≥ **5** | `lib/brief/priority.ts` |
| Brief article window | **28** days (article/release date) | `BRIEF_ARTICLE_WINDOW_DAYS` |
| Top 10 window | **365** days | `TOP_PRIORITY_ARTICLE_WINDOW_DAYS` |
| Top 10 scan floor | stored priority ≥ **6** | `TOP_PRIORITY_MIN_PRIORITY` |
| Priority model | **v5** ridge + PCA-8 | `lib/brief/priorityModel.ts` |
| Timezone | **America/New_York** | UI, lead story |
| Ingest slots (Eastern) | **06:00 / 17:00** → UTC **10 / 21** (**Vercel Cron only**) | `vercel.json` |
| Ingest summarize cap | default **40** (`DIGEST_MAX_SUMMARIES`) | `lib/digest/config.ts` |
| Priority model retrain | every **7 days** (daily cron check 18:00 ET); not per rating | `lib/brief/retrainSchedule.ts`, `/api/cron/retrain-priority` |
| Brief homepage cache | ~**1 h** ready payload (All + lead + images); bust on ingest + admin rating/setting; key `brief-homepage-ready-v4` | `lib/brief/homepageCache.ts` |
| Top 10 cache | ~**3 days** TTL; **no** ingest/rating bust; All-pool once | `lib/brief/topPriority.ts` |
| Feed slim / keyword index | ~**3 h**; bust on **ingest only** | `lib/feedCache.ts` |
| Feed default sort | **Ingested**: newest `fetched_at` first, then effective priority | `lib/feed.ts` |
| Trending keywords | ~**6 h**; bust with feed slim tag (ingest) | `lib/feed.ts` |

**Effective priority:** `admin_priority` → else `ml_priority` → else handcrafted live predict (legacy only).

**Effective setting:** `admin_setting` (exclusive single label) → else stored `auto_settings` → else live `classifyArticleSettings` (legacy rows only).

## Summaries & headlines (hard)

Source: `lib/summarize.ts`, `lib/brief/generateHeadline.ts`. Applies to **new** ingest/generation only unless the user asks to regenerate old rows.

- **Audience:** ID / AMS experts — they already know stewardship basics; do not over-explain foundations.
- **Angle:** Frame METHODS / RESULTS / BOTTOM LINE / headlines around antimicrobial stewardship (prescribing, resistance, diagnostics stewardship, implementation, practice-changing outcomes) — not a generic biomedical restatement.
- **BOTTOM LINE:** May (and often should) name study design up front (“Systematic review showed…”, “In this multicenter cohort…”, “In this randomized trial…”). Prefer that over a vague “this study”.
- **Do not over-promise:** If sensitivity / adjusted / propensity / stratified analyses weaken or erase the primary effect, do **not** lead with the fragile point estimate. Headline the durable takeaway (signal of benefit, no excess harm, comparable outcomes, feasibility). RESULTS should note the tension; BOTTOM LINE follows the authors’ durable conclusion.
- **Causality:** Causal verbs **only** for RCTs of a clear intervention. Systematic reviews / meta-analyses that mix observational data are **non-causal** unless clearly limited to RCT evidence. Observational / cohort / cross-sectional / quasi-experimental → associations or patterns only. When unsure, default non-causal.
- **Good caution example:** “Oral therapy shows signal of benefit and no harm for Gram-negative BSI” — not “cut mortality 61%” when sensitivity analyses nullify that signal.

## Embeddings & ML priority (hard)

| When | Embeddings? |
|------|-------------|
| **Ingest first rating** | **Yes** — `scoreFirstMlPriorities` → `summaries.ml_priority` |
| **Page load** | **No** — read `ml_priority` |
| **Retrain** | **Yes** — fit model only; scheduled every **7 days**, not per rating |

Helpers: `lib/brief/firstRating.ts`. No backfill unless asked. Retrain does not re-score old rows.

**Explicit handcrafted backfill (when asked):** `npm run backfill:ml-priority` → `scripts/backfill-ml-priority-handcrafted.ts`. Fills null `ml_priority` only where `admin_priority` is also null, last N months (default 12). Uses model + handcrafted features with **embeddings off**; never reads/writes `emb:*` cache. Prefer `--dry-run` first. Warn: pulls abstracts for eligible rows.

**Explicit auto_settings backfill (when asked):** `npm run backfill:auto-settings` → `scripts/backfill-auto-settings.ts`. Fills null `auto_settings` from title + keywords + MeSH (**no abstracts**). Requires `scripts/add_auto_settings.sql`. Prefer `--dry-run` first.

**Canonical ML score = stored `ml_priority` only** (handcrafted + embeddings at ingest). Never treat a page-load recompute without embeddings as the ML grade — that number can disagree and mislead (e.g. Brief gated on stored 5 while Admin showed live 4).

**Feed Admin UI:** show stored `ml_priority` as “ML (ingest)”. Feature breakdown may run without embeddings as a sketch only — label it clearly; do not present its total as the ML score.

## PubMed topic query (hard)

Main topic animal exclusion must be:

`(animals[MeSH] NOT humans[MeSH])`

**Never** bare `NOT animals[MeSH]`. In MeSH, Humans sits under Animals, so the bare form drops almost all MEDLINE human clinical papers. Keep case-report exclusion as before. Script: `scripts/fix_topic_query_animals_not_humans.sql`.

## Surfaces

- **PubMed only.** OpenAlex ingest → **410**. `parseFeedSource` always `pubmed`. No source switcher.
- **Brief** — curated, effective priority ≥5, **28-day article-date** window. Cached ready payload (~1 h, key `v4`): All → sticky lead → images; filter setting tabs in memory.
  - **Lead-by-recency (default):** sort by `max(publish date, ingest/fetched_at)` so a fresh ingest can surface when there is no newer publication to feature; then prefer published date, then ingest, then priority. Priority-first mode still uses that same recency as the tie-break.
  - **Sticky lead (current rule):** pins the natural #1 for the Eastern calendar day against *lower*-priority churn. Natural #1 with **equal or higher** effective priority **always replaces** the pin (so a newer same-score story can take the lead when lead-by-recency is on). **Old rule (do not restore):** only *strictly higher* priority could replace — that blocked same-day equal-priority updates.
  - Setting tabs do not rewrite sticky lead.
- **Brief digest email** — headline links to **PubMed**; no separate PubMed line under the story. Article date sits tightly **above** the headline. “Open today’s brief” / footer still point at the site.
- **`/feed`** — PubMed browser; SQL page for ingested/published/relevance (+ setting via `auto_settings`); keyword filter uses lighter index. Admin ML badge = stored `ml_priority`. Top-right **human rated** total (SQL head count, cached ~24h).
  - **Feed sort (hard):** **Ingested** = most recent `fetched_at` first, then effective priority (admin → ML). **Published** = newest article/release date first, then effective priority. **Relevance** = `rank_score` first.
- **`/dashboard`** — **retired** (redirects to `/feed`). Do not rebuild heavy analytics without an explicit ask.
- **SEO** — `/feed` + `/dashboard` **noindex**; `robots.ts` disallows tools. Brief/marketing stay indexable.
- Tab titles start with **Feed**; distinct route icons.

## Data fetching & egress (hard)

1. Never bulk-select `abstract`, `summary_text`, or embedding JSON for the whole corpus on page load.
2. Slim + hydrate (feed pages ≤ ~100; Brief survivors only).
3. Brief: slim → gate → hydrate (`lib/brief/items.ts`). Corpus/Brief slim **omit** keywords/MeSH; page-hydrate those for UI / story images.
4. Default `/feed`: SQL pagination — no full-corpus walk.
5. Prefer SQL paging for ingested / published / relevance / setting / unrated / min-priority (stored `rank_score`, dates, `auto_settings`). Keyword filter uses a lighter cached keyword index (~**3 h**). Full corpus slim index is a fallback only.
6. **Cache bust rules (do not “fix” by re-busting everything):**
   - **Ingest** busts: Brief homepage + feed slim index (trending shares that tag).
   - **Admin rating / setting** busts: Brief homepage **only**.
   - **Top 10:** TTL only (~3 days). Tag kept for rare manual bust — never on ingest/rating.
   - **Human-rated total on `/feed`:** TTL only (~24 h); SQL `count` head — no row bodies.
7. Top 10: cache **All** pool once (`getTopPriorityYearItems`); filter setting tabs in memory.
8. Ingest cron (`/api/cron/daily-digest`): PubMed summarize only — **no** legacy ASP emails, **no** abstract digest pulls. Brief email is `/api/cron/brief-digest` only.
9. Indexes/RLS: keep `optimize_postgres_hot_paths.sql` applied; re-run after new filter columns. Keep `scripts/add_auto_settings.sql` applied.
10. Prefer API URL (`*.supabase.co`) for supabase-js — not direct Postgres port 5432 from serverless.
11. Trending keywords: cached ~**6 h** (busts with feed slim index on ingest).
12. Select helpers live in `lib/feedSelect.ts`: `FEED_SELECT_SLIM` (no keywords/MeSH), `FEED_SELECT_KEYWORD_INDEX`.
13. **Priority model retrain:** every **7 days** via `/api/cron/retrain-priority` (daily check; skips if last train was within the week). Admin ratings save feedback only — do **not** retrain inline. Manual: `npm run retrain:priority` or `?force=1`.
14. **`/dashboard` retired** — do not reintroduce full-corpus or large date-range analytics without asking.

## Current state (done)

- Egress cuts: no web embedding reads; Brief cache; SQL feed paging; slim corpus without keywords/MeSH; `auto_settings` at ingest; Top 10 All-pool 3-day TTL; trending longer cache; **dashboard retired**; `/feed` human-rated total (24h head count); legacy ASP email retired.
- Ingest-time `ml_priority` with embeddings **once**; ingest-time `auto_settings`.
- Feed Admin shows stored `ml_priority` (not live no-embedding recompute).
- Main topic query uses `(animals[MeSH] NOT humans[MeSH])`.
- Admin setting exclusive; Brief cache busts on setting/rating; feed slim + Top 10 do **not**.
- Story images assigned on All pool (stable across setting tabs); skip URL health probes for curated CDN hosts.
- Dog stock photo (`vet-care` / photo-1548199973) only when text says dog/dogs.
- Top 10: 365 days, scan ≥ 6, human > ML on ties; cache ~**3 days** All-pool (tabs filter in memory).
- PubMed-only (OpenAlex UI + ingest disabled).
- Legacy ASP Literature Feed emails **retired**; Brief email only via `brief-digest`.
- CI smoke: OpenAlex expects **410**; PubMed feed + homepage **200**; Actions on Node 24 (`checkout`/`setup-node` v5).
- Hot-path indexes + RLS + `auto_settings` applied in Supabase.
- Fluid CPU cuts: summarize cap **40**; ingest **2×/day** (06:00 + 17:00 ET); priority retrain **weekly**; homepage ready cache ~1 h.
- Ingest hardening (Aug 2026): article upsert **always** sends `fetched_at` (preserve first-seen; never omit → PostgREST null); `runDailyDigest` **throws** on ingest failure (HTTP 500, no false-green cron); wrap `revalidateTag` in try/catch so cache bust never fails the run.
- Production schedule: **Vercel Cron only**; GitHub Actions ingest is **manual `workflow_dispatch`** (no schedule).
- Feed sort: newest first, then effective priority (ingested / published).
- Brief sort: prefer published, else recent ingest (`max(publish, fetched_at)`); sticky lead equal-or-higher replaces.
- Digest email: headline → PubMed; date above headline; no separate PubMed link under each story.
- Headline + bottom-line prompts: ID/AMS experts, stewardship angle, RCT-only causal language, do not over-promise vs sensitivity analyses.

## Still open (optional later)

- Embeddings still stored as big JSON in `app_settings` — longer-term: dedicated table or drop after scoring.
- Optional SEO: `metadataBase` / OG cleanup on public pages.
- Shrinking Top 10’s 365-day window — **ask first**.
- No surprise backfills, bulk recompute, or mass headline/summary regenerations without go-ahead.

## Ranking & settings

- Prefer stored `rank_score` for relevance sort when present.
- Settings multi-label (`lib/classifySetting.ts`); ED → hospital **and** community; admin override = one label.
- Prefer stored `auto_settings` on page load; do not re-classify from keywords/MeSH when `auto_settings` is present.
- **Admin setting is exclusive:** when `admin_setting` is set, `getItemSettings` / Brief filters / display use **only** that label. Never soft-match an admin-tagged paper into another capsule (e.g. admin=community must not appear under Hospital).
- Brief filter bar is a reduced set — don’t silently drop classifier labels.
- **Top 10 rank:** effective priority desc → human-rated before ML-only → relevance % → journal impact. Window 365 days; scan floor ≥ 6.

## Story images (hard)

- Assign on the full **All** candidate pool (after sticky lead), then filter by setting — same PMID → same photo on every tab.
- Prefer null over a weak / wrong photo. Keep uniqueness (catalog id + URL) on the All assignment.
- Stock photos that depict a specific subject must gate on that subject (e.g. dog photo → require “dog”/“dogs” only — not generic animal / One Health / veterinary).
- Do not re-assign images per setting tab.
- Skip server-side URL health probes for curated catalog hosts (Unsplash/Pexels/Wikimedia/local); client `onError` demotes broken images.

## Ingest & cron

- `/api/cron/daily-digest` via **Vercel Cron only** (GitHub Actions is manual `workflow_dispatch` — **no** scheduled Actions run). Auth: `CRON_SECRET`.
- `/api/cron/retrain-priority` daily 22:00 UTC — retrains only if ≥ **7 days** since `priority_model.trainedAt`.
- Ingest summarize default cap **40** (`DIGEST_MAX_SUMMARIES`).
- Show times in **Eastern**.
- “Newly summarized” = summaries written in that run — not “ML ≥ 5”.
- Ingest stats (feed) = **genuinely new only**: first-seen articles + new summaries. Do not count refreshes of already-summarized PMIDs. Persist via `saveLastIngestRunStats`.
- **`fetched_at` (hard):** always include on article upsert. New rows get the run stamp; existing rows keep prior `fetched_at`. **Never omit** the field on refresh (omitting made PostgREST null → NOT NULL outage).
- **Fail loud:** `runDailyDigest` must throw when PubMed ingest fails so cron returns HTTP 500 (no silent success).
- Cache bust after ingest: Brief homepage + feed slim; `revalidateTag` must be try/catch — never fail the ingest run.
- New summary → embed once → save `ml_priority` + `auto_settings` + headline under current prompt rules.
- Topic `query_string` animal filter: `(animals[MeSH] NOT humans[MeSH])` — see PubMed topic query section.

## UI / UX (soft)

- Keep existing Brief/feed look; avoid generic AI aesthetics.
- One job per section; don’t turn Brief into a stats console.
- **Graphic takeaway:** quiet salmon chip (same light pink as Your Brief), not a solid loud CTA. Opens a preview popup for download/share. Share menu keeps “Share graphic takeaway”.
- Digest email: headline links to PubMed (no separate PubMed line); article date sits tightly above the headline. Avoid em dashes (use `:` or `-`). Deliverability: send from verified Resend domain (`BRIEF_FROM_EMAIL`), List-Unsubscribe + List-Id, prefer brand links in chrome (header/footer) over mostly-PubMed URLs; see `docs/DAILY_DIGEST.md` spam checklist.
- Feed: show slim last-ingest line (when / ingested / summarized / ML ≥ 5) via `loadLastIngestStats` — counts + tiny `pmid, ml_priority` slice only.
- Brief homepage: date meta sits tightly above the headline; lead-by-recency prefers published then ingest.
- Feed sort: newest first (ingested=`fetched_at`, published=article date), then effective priority within the same time.
- Feed header: cached **human rated** total (~24h head count) — not a live corpus walk.

## Implementation checklist

- [ ] Thresholds/windows/cron/model untouched (or approved)
- [ ] No full-corpus abstract / embedding / keywords+MeSH egress on hot paths (slim omit; page-hydrate)
- [ ] Embeddings only at ingest + scheduled/manual retrain (not per rating)
- [ ] UI “ML” = stored `ml_priority` (not page-load no-embedding score)
- [ ] Brief gate / “why missing” uses **effective** priority (admin wins over ML)
- [ ] Topic query uses animals NOT humans (not bare animals)
- [ ] Admin setting exclusive (no soft-match into other capsules)
- [ ] Prefer stored `auto_settings` (ingest write; no live classify when present)
- [ ] Story images assigned on All pool; stable across setting tabs; curated hosts skip URL probe
- [ ] Brief slim → gate → hydrate; Top 10 no body hydrate
- [ ] Durable write + cheap read for new ML work
- [ ] PubMed-only preserved
- [ ] Cache bust: ingest → Brief + feed slim; rating/setting → Brief only; Top 10 TTL-only
- [ ] Top 10 All-pool cache; setting tabs filter in memory
- [ ] Feed sort: newest first, then effective priority (ingested / published)
- [ ] Brief sort: prefer published, else recent ingest; sticky equal-or-higher
- [ ] Digest email: headline → PubMed; date above headline; no under-story PubMed link
- [ ] Summaries/headlines: ID/AMS audience, stewardship angle, RCT-only causal, no over-promise
- [ ] Article upsert always sends `fetched_at` (preserve first-seen)
- [ ] Digest cron fails loud on ingest error; revalidateTag try/catch
- [ ] Ingest schedule = Vercel Cron only (Actions manual)
- [ ] `/dashboard` stays retired (redirect only)
- [ ] Eastern times where “day” matters
- [ ] SQL called out; ASCII-only in SQL comments
- [ ] Warned user if a change would add substantial egress / data use
- [ ] User-facing reply stays brief and novice-clear
- [ ] Commit/push only if user asked
