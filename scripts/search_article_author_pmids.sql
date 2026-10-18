-- Author-name search. Returns ids only (no abstracts).
-- A name matches if it appears in the author list, or every word
-- of a multi-word query (3+ letters) appears somewhere in that list.

create or replace function public.search_article_author_pmids(
  search_query text,
  result_limit integer default 80
)
returns table (pmid text)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cleaned as (
    select trim(regexp_replace(coalesce(search_query, ''), '[%_]', '', 'g')) as q
  ),
  terms as (
    select term
    from cleaned,
      unnest(regexp_split_to_array(lower(q), '\s+')) as term
    where length(term) >= 3
  )
  select a.pmid
  from public.articles a
  cross join cleaned c
  where c.q <> ''
    and exists (select 1 from terms)
    and (
      array_to_string(coalesce(a.authors, '{}'::text[]), ' ') ilike '%' || c.q || '%'
      or (
        (select count(*) from terms) > 1
        and (
          select bool_and(
            array_to_string(coalesce(a.authors, '{}'::text[]), ' ') ilike '%' || t.term || '%'
          )
          from terms t
        )
      )
    )
  limit greatest(1, least(coalesce(result_limit, 80), 200));
$function$;

revoke all on function public.search_article_author_pmids(text, integer) from public;
revoke all on function public.search_article_author_pmids(text, integer) from anon;
revoke all on function public.search_article_author_pmids(text, integer) from authenticated;
grant execute on function public.search_article_author_pmids(text, integer) to service_role;

notify pgrst, 'reload schema';
