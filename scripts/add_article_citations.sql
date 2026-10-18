-- OpenAlex citation counts for every article (PubMed and OpenAlex).
-- ASCII-only comments. Applied on pubmed-feed (rzocnbsprpdqfgqvgemq).

alter table public.articles
  add column if not exists cited_by_count integer,
  add column if not exists cited_by_at timestamptz;

create index if not exists articles_cited_by_at_idx
  on public.articles (cited_by_at);

create index if not exists articles_cited_by_count_idx
  on public.articles (cited_by_count desc)
  where cited_by_count is not null and cited_by_count > 0;

-- One round trip per batch of 100. Service role only.
create or replace function public.set_article_citation_counts(payload jsonb)
returns integer
language plpgsql
as $$
declare
  updated_count integer;
begin
  update public.articles a
  set
    cited_by_count = nullif(r.value->>'count', '')::integer,
    cited_by_at = now()
  from jsonb_array_elements(payload) as r(value)
  where a.pmid = r.value->>'pmid';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.set_article_citation_counts(jsonb) from public;
revoke all on function public.set_article_citation_counts(jsonb) from anon;
revoke all on function public.set_article_citation_counts(jsonb) from authenticated;
grant execute on function public.set_article_citation_counts(jsonb) to service_role;

-- Keep citation fields when an OpenAlex work id is rewritten to a PMID.
-- Same body as the live function, plus cited_by_count and cited_by_at.
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
    landing_url, cited_by_count, cited_by_at
  )
  select
    new_pmid, title, abstract, journal, pub_date, publication_types, mesh_terms,
    keywords, authors, source, fetched_at, study_subheading, study_label,
    article_date, epub_date, pubmed_date, release_date, relevance_score,
    corresponding_author_email, corresponding_author_name, doi, openalex_id,
    landing_url, cited_by_count, cited_by_at
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
