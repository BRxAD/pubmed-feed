-- One Brief email per inbox per Eastern calendar day (digest + welcome).
-- Stops overlapping cron retries and Gmail-alias duplicates.
-- Run in the Supabase SQL Editor. Safe to re-run. ASCII-only comments.

create table if not exists public.brief_email_recipient_sends (
  inbox_key text not null,
  kind text not null default 'brief',
  send_date date not null,
  sent_email text not null,
  created_at timestamptz not null default now(),
  primary key (inbox_key, kind, send_date)
);

create index if not exists brief_email_recipient_sends_sent_at_idx
  on public.brief_email_recipient_sends (created_at desc);

alter table public.brief_email_recipient_sends enable row level security;

comment on table public.brief_email_recipient_sends is
  'Claim log: one Brief (digest or welcome) per canonical inbox per Eastern day.';
