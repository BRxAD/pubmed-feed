-- Allow every care-setting label the feed Setting menu can save.
-- The original admin_setting check omitted dentistry, one-health, and
-- global-health, so those overrides returned Save failed.
-- Run in Supabase SQL Editor (ASCII comments only). Safe to re-run.

alter table public.summaries
  drop constraint if exists summaries_admin_setting_check;

alter table public.summaries
  add constraint summaries_admin_setting_check
  check (
    admin_setting is null
    or admin_setting in (
      'hospital',
      'community',
      'long-term care',
      'dentistry',
      'one-health',
      'global-health',
      'animal',
      'environment'
    )
  );
