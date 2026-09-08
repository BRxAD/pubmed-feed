-- Fix Supabase advisor: Function Search Path Mutable on next_auth.uid
-- Safe to re-run. ASCII-only.

create or replace function next_auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
