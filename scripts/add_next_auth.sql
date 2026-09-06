-- Auth tables in the PUBLIC schema (works without exposing a custom schema).
-- Run in the Supabase SQL Editor. Safe to re-run. ASCII-only comments.
-- App uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

create extension if not exists "uuid-ossp";

create table if not exists public.auth_users (
  id uuid not null default uuid_generate_v4(),
  name text,
  email text,
  "emailVerified" timestamptz,
  image text,
  password_hash text,
  email_frequency text not null default 'daily',
  settings_tags text[] not null default '{}',
  topics_tags text[] not null default '{}',
  high_impact_only boolean not null default false,
  updated_at timestamptz,
  constraint auth_users_pkey primary key (id),
  constraint auth_users_email_unique unique (email)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'auth_users_email_frequency_check'
      and conrelid = 'public.auth_users'::regclass
  ) then
    alter table public.auth_users
      add constraint auth_users_email_frequency_check
      check (email_frequency in ('daily', 'weekly', 'none'));
  end if;
end $$;

create table if not exists public.auth_accounts (
  id uuid not null default uuid_generate_v4(),
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  oauth_token_secret text,
  oauth_token text,
  "userId" uuid not null,
  constraint auth_accounts_pkey primary key (id),
  constraint auth_accounts_provider_unique unique (provider, "providerAccountId"),
  constraint auth_accounts_userId_fkey foreign key ("userId")
    references public.auth_users (id) match simple
    on update no action
    on delete cascade
);

create table if not exists public.auth_sessions (
  id uuid not null default uuid_generate_v4(),
  expires timestamptz not null,
  "sessionToken" text not null,
  "userId" uuid not null,
  constraint auth_sessions_pkey primary key (id),
  constraint auth_sessions_sessionToken_unique unique ("sessionToken"),
  constraint auth_sessions_userId_fkey foreign key ("userId")
    references public.auth_users (id) match simple
    on update no action
    on delete cascade
);

create table if not exists public.auth_verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  constraint auth_verification_tokens_pkey primary key (token),
  constraint auth_verification_tokens_token_unique unique (token),
  constraint auth_verification_tokens_identifier_token_unique unique (token, identifier)
);

create table if not exists public.saved_articles (
  user_id uuid not null references public.auth_users (id) on delete cascade,
  pmid text not null,
  title text,
  pubmed_url text,
  created_at timestamptz not null default now(),
  constraint saved_articles_pkey primary key (user_id, pmid)
);

create index if not exists auth_accounts_userId_idx
  on public.auth_accounts ("userId");

create index if not exists auth_sessions_userId_idx
  on public.auth_sessions ("userId");

create index if not exists saved_articles_user_id_created_at_idx
  on public.saved_articles (user_id, created_at desc);

alter table public.auth_users enable row level security;
alter table public.auth_accounts enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.auth_verification_tokens enable row level security;
alter table public.saved_articles enable row level security;
