-- Anonymous feedback survey: at most two prompts per hashed IP.
-- Run in Supabase SQL Editor. ASCII-only comments.

create table if not exists public.survey_prompts (
  ip_hash text primary key,
  status text not null default 'deferred'
    check (status in ('deferred', 'done')),
  show_count integer not null default 0
    check (show_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists survey_prompts_status_idx
  on public.survey_prompts (status);

alter table public.survey_prompts enable row level security;
