-- Postgres hot-path indexes + RLS lockdown for Stewardship Brief / pubmed-feed.
-- Aligned with Supabase Postgres best practices (indexes, FK indexes, partial
-- indexes, RLS). Run in Supabase SQL Editor.
--
-- Safe to re-run (IF NOT EXISTS). Does not open public access.
-- App uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

-- ── 1. summaries: feed / Brief / Top 10 (CRITICAL) ───────────────────────────
-- Hot path: WHERE topic_id = ? ORDER BY created_at DESC (+ optional range)
create index if not exists summaries_topic_created_at_idx
  on public.summaries (topic_id, created_at desc);

-- FK side of pmid → articles (unique(topic_id,pmid) does NOT cover pmid alone)
create index if not exists summaries_pmid_idx
  on public.summaries (pmid);

-- Rank / relevance sorts
create index if not exists summaries_topic_rank_score_idx
  on public.summaries (topic_id, rank_score desc nulls last)
  where rank_score is not null;

-- Brief / Top 10 stored-priority gates (partial = smaller, faster)
create index if not exists summaries_topic_admin_priority_idx
  on public.summaries (topic_id, admin_priority desc, created_at desc)
  where admin_priority is not null;

-- ml_priority indexes only if column exists (scripts/add_ml_priority.sql)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'summaries'
      and column_name = 'ml_priority'
  ) then
    execute $i$
      create index if not exists summaries_topic_ml_priority_idx
        on public.summaries (topic_id, ml_priority desc, created_at desc)
        where admin_priority is null and ml_priority is not null
    $i$;
    execute $i$
      create index if not exists summaries_topic_top_priority_ml_idx
        on public.summaries (topic_id, created_at desc)
        where admin_priority is null and ml_priority >= 6
    $i$;
  end if;
end $$;

-- Top 10 scan floor (≥ 6) — matches TOP_PRIORITY_MIN_PRIORITY
create index if not exists summaries_topic_top_priority_admin_idx
  on public.summaries (topic_id, created_at desc)
  where admin_priority >= 6;

-- ── 2. articles: date / source filters on !inner joins ───────────────────────
create index if not exists articles_source_idx
  on public.articles (source);

create index if not exists articles_release_date_idx
  on public.articles (release_date)
  where release_date is not null;

create index if not exists articles_pub_date_idx
  on public.articles (pub_date)
  where pub_date is not null;

-- Dashboard / Brief: source + date together
create index if not exists articles_source_release_date_idx
  on public.articles (source, release_date desc)
  where release_date is not null;

-- ── 3. app_settings: already PK on key; keep embedding keys from bloating plans
-- (no change — primary key covers emb: lookups)

-- ── 4. RLS lockdown (service role only; no anon policies) ────────────────────
-- Same pattern as pubmed_ingest_state / brief_subscribers.
alter table public.topics enable row level security;
alter table public.articles enable row level security;
alter table public.summaries enable row level security;
alter table public.app_settings enable row level security;
alter table public.journal_metrics enable row level security;

do $$
begin
  if to_regclass('public.relevance_feedback') is not null then
    execute 'alter table public.relevance_feedback enable row level security';
  end if;
  if to_regclass('public.pubmed_ingest_state') is not null then
    execute 'alter table public.pubmed_ingest_state enable row level security';
  end if;
  if to_regclass('public.openalex_ingest_state') is not null then
    execute 'alter table public.openalex_ingest_state enable row level security';
  end if;
end $$;

-- Do NOT add "using (true)" policies for anon — that would re-open tables.

-- ── 5. Planner stats ─────────────────────────────────────────────────────────
analyze public.summaries;
analyze public.articles;
analyze public.topics;
analyze public.app_settings;
