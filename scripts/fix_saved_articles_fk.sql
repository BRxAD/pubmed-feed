-- Fix saved_articles FK: must reference public.auth_users (NextAuth),
-- not next_auth.users. Safe to re-run. ASCII-only.

alter table public.saved_articles
  drop constraint if exists saved_articles_user_id_fkey;

alter table public.saved_articles
  add constraint saved_articles_user_id_fkey
  foreign key (user_id) references public.auth_users (id)
  on delete cascade;
