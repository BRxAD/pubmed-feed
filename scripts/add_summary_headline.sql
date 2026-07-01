-- Plain-language headline for The Stewardship Brief (typically 90–180 chars).
alter table public.summaries
  add column if not exists headline text;

comment on column public.summaries.headline is
  'Editorial headline for Stewardship Brief; also embedded as [HEADLINE] in summary_text.';
