---
name: stewardship-brief-conventions
description: >-
  Product conventions for The Stewardship Brief / pubmed-feed (Next.js + Supabase):
  plain-language mental model, Brief eligibility, date windows, Eastern cron/ingest,
  feed/dashboard fetch and egress, ranking/priority/embeddings lifecycle, multi-label
  settings, known loose ends, and hard change-control. Use when working on Brief,
  homepage, /feed, /dashboard, ingest, cron, summaries, ranking, priority ML,
  embeddings, settings classification, Supabase queries, or related API routes.
---

# Stewardship Brief — product conventions

Apply these when changing Brief, feed, dashboard, ingest, ranking, or Supabase access.

## Plain-language mental model (read this first)

Think of the product like a newspaper desk:

1. **Ingest (the night shift)** — New papers arrive. We write a short summary, compute a relevance score (`rank_score`), and give a **priority grade 1–10** (`ml_priority`) using the smart model **including embeddings**. That grade is saved on the article row. Do this **once**.
2. **Your rating (editor override)** — If a human sets `admin_priority`, that wins forever over the machine grade.
3. **Homepage / Brief (the front page)** — Show only strong stories (priority ≥ **5**) from the last **28** days. Do **not** re-run the smart embedding model for every visitor. Read the saved grade.
4. **Top 10** — Looking back **365** days, but only **scan** rows with saved priority ≥ **6** (stricter than Brief’s ≥5). Still reading saved grades — not re-embedding.
5. **Retrain** — Periodically (when you rate articles), rebuild the grading rubric from past ratings + embeddings. That improves **future** ingest grades. It does **not** automatically rewrite old `ml_priority` values unless we explicitly re-score.

### Words we use

| Word | Simple meaning |
|------|----------------|
| **Embedding** | A numeric “meaning fingerprint” of title+abstract from OpenAI. Useful for grading; **huge** to download repeatedly. |
| **First rating** | The one-time machine grade at ingest → stored as `ml_priority`. |
| **Handcrafted features** | Simpler signals (journal, study type, keywords, etc.) without the embedding fingerprint. Fine for **old** rows that never got `ml_priority`. |
| **Slim** | Fetch the small fields first (title, dates, saved scores) — not the long abstract/summary text. |
| **Hydrate** | After you know the winners, fetch the long text **only for those**. “Fill in details later.” |
| **Egress** | Bytes leaving Supabase. Free plan has a monthly cap; big text × many page loads burns it. |
| **Train ≠ serve** | Improving the model (train) is incomplete until new articles get a **saved** grade at ingest (serve). |

### Brief load in three steps (required pattern)

1. **Slim pass** — Load many candidate rows **without** abstract / `summary_text` bodies.
2. **Gate** — Keep rows with saved priority ≥ 5 (`admin_priority` or `ml_priority`). Old rows with no `ml_priority`: handcrafted score is OK (may hydrate abstract **only for those**).
3. **Hydrate survivors** — Load abstract + summary text only for homepage/digest winners. Top 10 sidebar skips body hydrate.

### What we will not do

- Re-download embedding JSON on every Brief/feed/dashboard visit.
- Build a backfill to re-grade all old articles unless the user asks.
- Shrink Brief/Top 10 windows or change Brief ≥5 / Top 10 scan ≥6 without asking.
- Commit/push unless the user asks.

---

## Ask before changing (hard)

Do **not** change without explicit user approval:

- Brief min priority threshold (`BRIEF_MIN_PRIORITY`, currently **5**)
- Top 10 scan floor (`TOP_PRIORITY_MIN_PRIORITY`, currently **6**)
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
| Top 10 scan floor | stored priority ≥ **6** | `TOP_PRIORITY_MIN_PRIORITY` (SQL prefilter; Brief stays at 5) |
| Dashboard default range | last **28** days | `lib/dashboard.ts` → `defaultDashboardRange` |
| Priority model | version **5**, `ridge_regression` | `lib/brief/priorityModel.ts` |
| Timezone for display / “day” | **America/New_York** (Eastern) | UI formatters, lead story |
| Ingest slots (Eastern) | **06:00 / 12:00 / 17:00** → UTC **10 / 16 / 21** | `vercel.json`, `lib/dashboard.ts` |

**Effective priority:** human `admin_priority` wins; else use stored `ml_priority`; else handcrafted live predict (legacy only).

## Design lesson: train ≠ serve (hard)

Improving model AUC (retrain with embeddings) is **not** the same as applying that model to new articles.

| Path | What it does | What it does **not** do |
|------|----------------|-------------------------|
| **Retrain** | Fits PCA + ridge from embeddings + admin ratings → better weights | Persist a score on each new summary |
| **Page-load scoring** (legacy) | Sometimes minted/read embeddings on Brief hit | Durable, cheap, egress-safe first rating |
| **Ingest first rating** (required) | Mint embedding once → predict → write `ml_priority` | Re-run on every visitor |

**Rule:** expensive or model-dependent work runs **once at write time** (ingest / retrain / admin action). Page loads **read stored results**. If a feature only improves offline metrics but never writes a durable field used on read, treat it as incomplete.

Historical gap (fixed in code): embeddings improved retrain AUC, but ingest did not store an embedding-aware score. **User confirmed `scripts/add_ml_priority.sql` is applied** in Supabase. **Retrain does not rewrite old `ml_priority`** — only new ingest uses the updated model (user confirmed).

## Embeddings & ML priority (hard)

The embedding-augmented priority model exists so **new articles get a full first rating** (handcrafted features + embedding PCA). That is the main reason embeddings were added.

| When | Use embeddings? |
|------|-----------------|
| **First rating** (ingest / first score of a new summary) | **Yes** — `scoreFirstMlPriorities` → write `summaries.ml_priority`. |
| **Page load** (Brief, Top 10, `/feed`, `/dashboard`, digest render) | **No** — read `ml_priority` (admin wins). Never re-read embedding JSON / re-mint. |
| **Retrain** (`relearnPriorityModel` / admin rating retrain) | **Yes** — fit PCA + ridge weights only. |

Column: `summaries.ml_priority` (`scripts/add_ml_priority.sql`). Helpers: `lib/brief/firstRating.ts`.

**Legacy rows:** no `ml_priority` → handcrafted-only is fine. **No backfill script** unless the user asks. Going forward, ingest writes embedding-aware `ml_priority`.

**After retrain:** existing `ml_priority` values stay as-is unless the user asks to re-score. New ingest uses the new model.

## Surfaces

- **Brief (homepage / email):** curated, priority-gated, 28-day article window; not a raw dump of `/feed`.
- **`/feed`:** full corpus browser; default sort = ingested; filters/relevance may use cached slim index.
- **`/dashboard`:** analytics for selected article-date range; Top 10 must use same ranker as homepage (`getRankedTopPriorityItems` / `rankTopPriorityItems`).

Tab titles: start with **Dashboard** / **Feed** so the browser tab is obvious. Distinct route icons under `app/dashboard/icon.svg` and `app/feed/icon.svg`.

**SEO:** `/feed` and `/dashboard` are **noindex, nofollow** (layout metadata). `robots.ts` also disallows those paths. Public Brief/marketing pages remain indexable.

## Data fetching & egress (hard)

Supabase free-tier egress and statement timeouts are real constraints.

1. **Never** bulk-select `abstract`, `summary_text`, or huge JSON (embedding cache) for the whole corpus on page load.
2. **Slim + hydrate:** feed uses slim columns (`lib/feedSelect.ts`); hydrate bodies only for small feed pages (≤ ~100) or Brief homepage survivors. Dashboard does **not** hydrate abstracts. Brief Top 10 (`skipHeadlines`) skips body hydrate.
3. **Brief slim → gate → hydrate:** see plain-language section; implemented in `lib/brief/items.ts` (`getBriefItems`).
4. **Default `/feed` browse** (ingested, no filters, small page): SQL pagination (`fetchIngestedPage`) — do not walk the full corpus.
5. **Filters / relevance / published:** cached slim index (`lib/feedCache.ts`, tag `feed-slim-index`, ~10 min); bust on ingest and admin priority changes.
6. **No embedding-cache reads on web/digest:** `getBriefItems` defaults `useEmbeddings: false`.
7. **Cache Brief + Top 10:** `brief-homepage` (~10 min), `brief-top-priority` (~15 min); bust on ingest and admin rating.
8. **Dashboard:** `getFeedItemsInArticleDateRange` (cap ~1500) — never load the full 20k corpus for charts.
9. **Ingest:** write `rank_score` + `ml_priority` on summary upsert; prefer service role; RLS on watermark tables with no anon policies.
10. **Compute once, store, read cheap:** same pattern as `rank_score` and `ml_priority`.

If a change reintroduces full-corpus abstract pulls or parallel giant joins, stop and redesign.

## Known loose ends & efficiency backlog

Not all are “bugs”; track them so agents don’t reintroduce worse patterns. **Ask before** changing windows/thresholds or running large jobs.

### Incomplete loops

- **`ml_priority` SQL:** applied (user confirmed). Keep `scripts/add_ml_priority.sql` for new environments.
- **Null `ml_priority` on older rows:** handcrafted fallback OK on Brief; no backfill unless asked. Top 10 SQL scan skips them (needs stored ≥6).
- **Embeddings still in `app_settings`:** bad long-term shape (huge JSON). Prefer dedicated table or drop full vectors after writing `ml_priority`. Never expose full vectors on hot paths.
- **Retrain ≠ re-score old rows** (user confirmed OK).

### Still open (efficiency / SEO)

- **Top 10:** SQL prefilter stored priority ≥ **6** over 365 days (done). Shrinking the 365-day window still needs ask.
- **Dashboard without abstracts:** coarser setting/ML charts — intentional; don’t re-hydrate for “accuracy” without approval.
- **SEO:** noindex on `/feed` + `/dashboard` (done). Optional later: `metadataBase`/OG cleanup on public pages.
- Prefer Next cache tags over repeated Supabase hits; Cached Egress was historically ~0.

### Operational

- Avoid dashboard / admin “explain all” during egress pressure unless needed.
- Avoid bulk scripts (`recompute:rank-scores`, year re-ingest, embedding backfills) without an explicit go-ahead.
- Ingest costs OpenAI embeddings **per new summary** — keep `maxSummaries` sane; batch via `scoreFirstMlPriorities`.

### Pattern checklist for new features

When adding ML, LLM, or heavy joins:

1. Where is the durable write? (column / cache tag / not at all?)
2. Does page load only read the durable result?
3. What happens to **old rows**? (null-safe fallback; backfill only if asked)
4. Worst-case Supabase bytes per anonymous homepage hit?
5. Explained in plain language in this skill if it changes the mental model?

## Ranking & settings

- Relevance: prefer stored `rank_score` when present (`computeStoredRankScore` / `npm run recompute:rank-scores`).
- Settings are **multi-label** (`lib/classifySetting.ts`). ED → hospital **and** community. Admin override = single label.
- Brief filter bar is a reduced set — don’t silently drop classifier labels when editing the bar.

## Ingest & cron

- Primary digest: `/api/cron/daily-digest` (also GitHub Actions). Auth via `CRON_SECRET`.
- Display last/next ingest in **Eastern**.
- “Newly summarized” = distinct PMIDs summarized in that ingest window — not “ML ≥ 5”.
- New summary → first rating with embeddings → persist `ml_priority`. Page loads never mint embeddings for grading.

## UI / UX (soft — prefer)

- Follow existing Brief / feed visual language; avoid generic AI aesthetics.
- Prefer one job per section; don’t turn the Brief into a dashboard.
- Cards only when they aid interaction; keep motion intentional and sparse.
- Preserve brand strength on promotional/Brief surfaces (brand first, not nav-only).

## Implementation checklist

Before finishing a change in this domain:

- [ ] Thresholds/windows/cron/model untouched (or user approved)
- [ ] No full-corpus abstract / embedding-cache egress on hot paths
- [ ] Embeddings only for first rating (ingest) + retrain — not on every page load
- [ ] Brief still slim → gate → hydrate (Top 10 skips body hydrate)
- [ ] New model/LLM work has durable write + cheap read (train ≠ serve)
- [ ] Old rows: null-safe fallback; no surprise backfill
- [ ] Feed default path still SQL-paginated when unfiltered
- [ ] Cache tags revalidated on ingest / admin rating when index changes
- [ ] Dashboard Top 10 still shares homepage ranker
- [ ] Times shown remain Eastern where ingest/Brief “day” matters
- [ ] Required SQL migrations called out (`add_ml_priority.sql`, etc.)
- [ ] Plain-language mental model still accurate if behavior changed
