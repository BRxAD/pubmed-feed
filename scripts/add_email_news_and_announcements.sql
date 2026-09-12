-- Add include_news to auth_users, create brief_news_email_sends to track sent news,
-- and create brief_announcements for the customizable announcement section.
-- Run in Supabase SQL Editor.

-- 1. User preferences: opt in/out of "in the news" (default: in/true)
alter table public.auth_users
  add column if not exists include_news boolean not null default true;

-- 2. Track news items already emailed in a brief digest (dedupe across days)
create table if not exists public.brief_news_email_sends (
  news_id text primary key,
  sent_at timestamptz not null default now()
);

create index if not exists brief_news_email_sends_sent_at_idx
  on public.brief_news_email_sends (sent_at desc);

alter table public.brief_news_email_sends enable row level security;

-- 3. Customizable announcement section for upcoming briefs
create table if not exists public.brief_announcements (
  id text primary key default 'active',
  title text not null default '',
  body text not null default '',
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.brief_announcements enable row level security;

insert into public.brief_announcements (id, title, body, active)
values ('active', '', '', false)
on conflict (id) do nothing;
