-- Prefer scripts/add_next_auth.sql (creates public.auth_users with password_hash).
-- This file is only for older next_auth schema installs.

alter table next_auth.users
  add column if not exists password_hash text;
