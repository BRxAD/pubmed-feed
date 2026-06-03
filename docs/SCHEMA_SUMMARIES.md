# summaries table (required for ingest)

Ingest writes **subheading** and **label** (study classification) into the **summaries** table (column **summary_text** holds the summary content). If the subheading/label columns are missing, you get:

`Insert summary failed: Could not find the 'subheading' column of 'summaries' in the schema cache`

**Fix:** Run in Supabase SQL Editor:

```sql
ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS subheading text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS rank_score numeric;
```

Or run **`scripts/fix_summaries_for_ingest.sql`**.

**Full table definition** (for new setups):

```sql
create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  pmid text not null references public.articles(pmid) on delete cascade,
  summary_text text not null,
  prompt_version int not null default 1,
  created_at timestamptz not null default now(),
  subheading text,
  label text,
  rank_score numeric,
  unique(topic_id, pmid)
);
```
