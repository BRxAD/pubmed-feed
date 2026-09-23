-- New auth_users rows default to weekly Brief email.
-- Existing daily / none choices are left unchanged.
-- Run in Supabase SQL Editor (ASCII comments only).

alter table public.auth_users
  alter column email_frequency set default 'weekly';
