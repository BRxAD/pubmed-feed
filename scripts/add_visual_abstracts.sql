-- Visual abstracts (beta): one row per paper, made only when a signed-in reader clicks.
-- Service role writes; no anon table policies. Run in Supabase SQL Editor. ASCII-only comments.
--
-- status: pending (claimed) -> extracting (reading the abstract) -> extracted (findings saved)
--         -> rendering (drawing) -> ready (picture stored). failed can be retried by a click.
-- content holds the verified findings (about 15 KB). Never select it in bulk; read it by pmid only.

create table if not exists public.visual_abstracts (
  pmid text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'extracting', 'extracted', 'rendering', 'ready', 'failed')),
  content jsonb,
  content_version text,
  render_version text,
  image_path text,
  error_code text,
  error_message text,
  attempts integer not null default 0
    check (attempts >= 0),
  cost_usd numeric(8, 4) not null default 0,
  requested_by uuid references public.auth_users (id) on delete set null,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visual_abstracts enable row level security;

-- Daily and hourly request caps count rows by requested_at (and requested_by).
create index if not exists visual_abstracts_requested_at_idx
  on public.visual_abstracts (requested_at desc);

create index if not exists visual_abstracts_requested_by_idx
  on public.visual_abstracts (requested_by, requested_at desc);

-- Finding stuck or failed rows stays cheap; most rows are ready.
create index if not exists visual_abstracts_open_idx
  on public.visual_abstracts (status, updated_at)
  where status <> 'ready';

-- The pictures: 1600 x 900 PNG, about 150 to 400 KB. Public read (shared links and
-- social previews); only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visual-abstracts',
  'visual-abstracts',
  true,
  2097152,
  array['image/png']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists visual_abstracts_public_read on storage.objects;
create policy visual_abstracts_public_read
on storage.objects
for select
to public
using (bucket_id = 'visual-abstracts');
