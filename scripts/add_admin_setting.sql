-- Persist manual setting overrides from /feed (admin mode).
-- Run in Supabase SQL Editor.

alter table public.summaries
  add column if not exists admin_setting text
  check (
    admin_setting is null
    or admin_setting in (
      'hospital',
      'community',
      'long-term care',
      'animal',
      'environment'
    )
  );

comment on column public.summaries.admin_setting is
  'Manual setting override from /feed; wins over auto-classification when set.';
