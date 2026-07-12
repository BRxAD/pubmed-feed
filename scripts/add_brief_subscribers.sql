create table if not exists public.brief_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.brief_subscribers enable row level security;

-- Service role (used by /api/brief/subscribe) bypasses RLS.
-- Daily send: Vercel cron hits /api/cron/brief-digest at 11:05 UTC (7:05am ET).
