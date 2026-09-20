-- DOI merge for OpenAlex + PubMed dual ingest.
-- ASCII-only comments. Run in Supabase SQL Editor if not already applied.

alter table public.articles
  add column if not exists doi text,
  add column if not exists openalex_id text,
  add column if not exists landing_url text;

create unique index if not exists articles_doi_unique
  on public.articles (doi)
  where doi is not null;

create unique index if not exists articles_openalex_id_unique
  on public.articles (openalex_id)
  where openalex_id is not null;

create index if not exists articles_doi_idx
  on public.articles (doi)
  where doi is not null;

-- Keep first-seen stamp and merge ids when an upsert omits them.
create or replace function public.articles_preserve_merge_fields()
returns trigger
language plpgsql
as $$
begin
  if TG_OP <> 'UPDATE' then
    return NEW;
  end if;

  if OLD.fetched_at is not null then
    if NEW.fetched_at is null or NEW.fetched_at > OLD.fetched_at then
      NEW.fetched_at := OLD.fetched_at;
    end if;
  end if;

  if NEW.doi is null then
    NEW.doi := OLD.doi;
  end if;
  if NEW.openalex_id is null then
    NEW.openalex_id := OLD.openalex_id;
  end if;
  if NEW.landing_url is null then
    NEW.landing_url := OLD.landing_url;
  end if;

  return NEW;
end;
$$;

drop trigger if exists articles_preserve_merge_fields on public.articles;
create trigger articles_preserve_merge_fields
  before update on public.articles
  for each row
  execute function public.articles_preserve_merge_fields();

-- Rewrite temporary OpenAlex work id to a PubMed PMID without duplicating the row.
create or replace function public.rekey_article_pmid(old_pmid text, new_pmid text)
returns void
language plpgsql
as $$
begin
  if old_pmid is null or new_pmid is null then
    raise exception 'pmid required';
  end if;
  if old_pmid = new_pmid then
    return;
  end if;
  if not exists (select 1 from public.articles where pmid = old_pmid) then
    raise exception 'source article % not found', old_pmid;
  end if;
  if exists (select 1 from public.articles where pmid = new_pmid) then
    raise exception 'target pmid % already exists', new_pmid;
  end if;

  insert into public.articles (
    pmid, title, abstract, journal, pub_date, publication_types, mesh_terms,
    keywords, authors, source, fetched_at, study_subheading, study_label,
    article_date, epub_date, pubmed_date, release_date, relevance_score,
    corresponding_author_email, corresponding_author_name, doi, openalex_id,
    landing_url
  )
  select
    new_pmid, title, abstract, journal, pub_date, publication_types, mesh_terms,
    keywords, authors, source, fetched_at, study_subheading, study_label,
    article_date, epub_date, pubmed_date, release_date, relevance_score,
    corresponding_author_email, corresponding_author_name, doi, openalex_id,
    landing_url
  from public.articles
  where pmid = old_pmid;

  update public.summaries set pmid = new_pmid where pmid = old_pmid;
  update public.relevance_feedback set pmid = new_pmid where pmid = old_pmid;

  update public.saved_articles sa
  set pmid = new_pmid
  where sa.pmid = old_pmid
    and not exists (
      select 1 from public.saved_articles s2
      where s2.user_id = sa.user_id and s2.pmid = new_pmid
    );
  delete from public.saved_articles where pmid = old_pmid;

  update public.brief_email_sends
  set pmid = new_pmid
  where pmid = old_pmid
    and not exists (
      select 1 from public.brief_email_sends s2 where s2.pmid = new_pmid
    );
  delete from public.brief_email_sends where pmid = old_pmid;

  update public.author_outreach
  set pmid = new_pmid
  where pmid = old_pmid
    and not exists (
      select 1 from public.author_outreach s2 where s2.pmid = new_pmid
    );
  delete from public.author_outreach where pmid = old_pmid;

  delete from public.articles where pmid = old_pmid;
end;
$$;

revoke all on function public.rekey_article_pmid(text, text) from public;
grant execute on function public.rekey_article_pmid(text, text) to service_role;
