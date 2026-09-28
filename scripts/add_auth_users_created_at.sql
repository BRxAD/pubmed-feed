-- Account created_at for /feed signup counts.
-- Run in the Supabase SQL Editor. Safe to re-run. ASCII-only comments.

alter table public.auth_users
  add column if not exists created_at timestamptz;

update public.auth_users
  set created_at = "emailVerified"
  where created_at is null
    and "emailVerified" is not null;

alter table public.auth_users
  alter column created_at set default now();

comment on column public.auth_users.created_at is
  'When the account row was created. Null on some legacy rows.';
