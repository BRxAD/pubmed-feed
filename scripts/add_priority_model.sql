-- Ridge-regression priority model (JSON coefficients) per topic.
-- Run in Supabase SQL Editor.

alter table public.topics
  add column if not exists priority_model jsonb;

comment on column public.topics.priority_model is
  'Trained ridge-regression weights for brief priority prediction (admin labels 1–10).';
