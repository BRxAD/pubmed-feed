-- Fix rekey_article_pmid: copying doi/openalex_id while the old row still
-- exists trips unique indexes and aborts PubMed ingest.
-- ASCII-only comments.

create or replace function public.rekey_article_pmid(old_pmid text, new_pmid text)
returns void
language plpgsql
as $$
declare
  kept_doi text;
  kept_openalex_id text;
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

  select doi, openalex_id
    into kept_doi, kept_openalex_id
  from public.articles
  where pmid = old_pmid;

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
    corresponding_author_email, corresponding_author_name, null, null,
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

  update public.articles
  set doi = kept_doi,
      openalex_id = kept_openalex_id
  where pmid = new_pmid;
end;
$$;
