-- Author recognition emails after a human priority rating of 5 or higher.
-- Run in Supabase SQL Editor. ASCII-only comments.
-- Does not backfill historical ratings.

alter table public.articles
  add column if not exists corresponding_author_email text,
  add column if not exists corresponding_author_name text;

comment on column public.articles.corresponding_author_email is
  'Corresponding author email parsed from PubMed XML at ingest. Not used on public selects.';

comment on column public.articles.corresponding_author_name is
  'Corresponding author display name from PubMed XML at ingest.';

create table if not exists public.author_outreach (
  pmid text primary key,
  corresponding_email text,
  corresponding_name text,
  title text,
  journal text,
  headline text,
  status text not null default 'pending'
    check (status in (
      'pending',
      'held',
      'never',
      'skipped_no_email',
      'cancelled',
      'sent',
      'skipped_optout'
    )),
  subject text,
  body_text text,
  body_html text,
  queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  resend_id text,
  error text
);

create index if not exists author_outreach_status_queued_idx
  on public.author_outreach (status, queued_at desc);

create index if not exists author_outreach_email_idx
  on public.author_outreach (corresponding_email)
  where corresponding_email is not null;

alter table public.author_outreach enable row level security;

create table if not exists public.author_outreach_optouts (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.author_outreach_optouts enable row level security;
