-- In the news: RSS candidates with approve-before-publish.
-- Run in Supabase SQL Editor. ASCII-only comments.

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  guid text not null,
  title text not null,
  url text not null,
  published_at timestamptz,
  summary text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, guid)
);

create index if not exists news_items_status_published_idx
  on public.news_items (status, published_at desc nulls last);

create index if not exists news_items_status_created_idx
  on public.news_items (status, created_at desc);

alter table public.news_items enable row level security;
