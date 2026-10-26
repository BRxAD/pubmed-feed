-- Second-rater queue. Scores here do not change admin_priority or the model.
-- Run in Supabase SQL Editor. ASCII-only comments.

create table if not exists public.second_rater_items (
  topic_id uuid not null references public.topics (id) on delete cascade,
  pmid text not null,
  position integer not null check (position > 0),
  band text not null check (band in ('boundary', 'check')),
  ml_priority smallint,
  admin_priority_at_draw smallint,
  rating smallint check (rating is null or (rating >= 1 and rating <= 10)),
  rated_at timestamptz,
  primary key (topic_id, pmid),
  unique (topic_id, position)
);

create index if not exists second_rater_items_unrated_idx
  on public.second_rater_items (topic_id, position)
  where rating is null;

alter table public.second_rater_items enable row level security;

comment on table public.second_rater_items is
  'Independent second-rater scores. Not used as admin_priority and not used to train the model.';
