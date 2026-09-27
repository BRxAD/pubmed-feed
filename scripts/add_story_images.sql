-- Generated Brief story photos. Service role writes; no anon table policies.
-- Public image bytes live in the story-images bucket. ASCII-only.

create table if not exists public.story_images (
  pmid text primary key,
  url text not null,
  storage_path text not null,
  label text not null default '',
  tags text[] not null default '{}',
  settings text[] not null default '{}',
  cost_usd numeric(8, 4) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.story_images enable row level security;

create index if not exists story_images_created_at_idx
  on public.story_images (created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-images',
  'story-images',
  true,
  5242880,
  array['image/png']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists story_images_public_read on storage.objects;
create policy story_images_public_read
on storage.objects
for select
to public
using (bucket_id = 'story-images');
