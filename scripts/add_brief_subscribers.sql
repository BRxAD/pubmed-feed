create table if not exists public.brief_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.brief_subscribers enable row level security;
