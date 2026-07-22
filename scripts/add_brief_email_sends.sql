-- Track PMIDs already included in a Stewardship Brief email (dedupe across days).
-- Run in Supabase SQL Editor.

create table if not exists public.brief_email_sends (
  pmid text primary key,
  sent_at timestamptz not null default now()
);

create index if not exists brief_email_sends_sent_at_idx
  on public.brief_email_sends (sent_at desc);

alter table public.brief_email_sends enable row level security;
