import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizePmid } from "@/lib/savedArticleTypes";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import {
  journalsForQuery,
  type BriefSearchMode,
} from "@/lib/brief/journalSearch";
import type { BriefItem } from "@/lib/brief/items";

export type { BriefSearchMode };

export type BriefSearchResult = {
  items: BriefItem[];
  /** journal: the query named one journal, so these are only that journal. */
  mode: BriefSearchMode;
  /** Stored journal strings when mode is journal. */
  journalNames: string[] | null;
};

/** A journal browse is newest-first and can run past the 40-hit text list. */
const JOURNAL_SEARCH_LIMIT = 120;

let journalCatalog: { at: number; names: string[] } | null = null;
const JOURNAL_CATALOG_MS = 60 * 60 * 1000;

/**
 * Computes a search relevance score for an article against a user's query.
 * Higher score = more relevant.
 */
export function computeSearchRelevance(
  item: BriefItem,
  rawQuery: string,
  ftsRank?: number
): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  // Direct exact PMID match always ranks at the very top
  if (item.pmid.toLowerCase() === query) {
    return 10000;
  }

  let score = 0;

  // 1. Database full-text rank from PostgreSQL ts_rank
  if (ftsRank && Number.isFinite(ftsRank) && ftsRank > 0) {
    score += ftsRank * 100;
  }

  const title = (item.title || "").toLowerCase();
  const headline = (item.headline || "").toLowerCase();
  const bottomLine = (item.bottomLine || "").toLowerCase();
  const abstract = (item.abstractSnippet || "").toLowerCase();
  const titleHeadline = `${headline} ${title}`;
  const authorText = (item.authors || []).join(" ").toLowerCase();
  const summaryText = `${item.methods || ""} ${item.results || ""} ${bottomLine}`.toLowerCase();

  // 2. Exact phrase match in title, headline, or author list
  if (authorText.includes(query)) {
    score += 180;
  }
  if (titleHeadline.includes(query)) {
    score += 150;
  } else if (summaryText.includes(query)) {
    score += 50;
  } else if (abstract.includes(query)) {
    score += 25;
  }

  // 3. Multi-term matching
  const stopWords = new Set([
    "in",
    "and",
    "the",
    "of",
    "for",
    "with",
    "a",
    "an",
    "to",
    "on",
    "at",
    "by",
    "from",
  ]);
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 1 && !stopWords.has(t));

  if (terms.length > 1) {
    const allInTitle = terms.every((t) => titleHeadline.includes(t));
    if (allInTitle) score += 60;
    const allInAuthors = terms.every((t) => authorText.includes(t));
    if (allInAuthors) score += 80;

    const allInSummary = terms.every(
      (t) => summaryText.includes(t) || titleHeadline.includes(t)
    );
    if (allInSummary) score += 30;
  }

  for (const term of terms) {
    if (titleHeadline.includes(term)) {
      score += 25;
    }
    if (authorText.includes(term)) {
      score += 30;
    }
    if (summaryText.includes(term)) {
      score += 10;
    }
    if (abstract.includes(term)) {
      score += 5;
      const count = abstract.split(term).length - 1;
      score += Math.min(count, 5);
    }
  }

  // 4. Priority rating and clinical relevance as quality tiebreakers
  score += (item.effectivePriority ?? 5) * 2;
  if (item.relevancePercent) {
    score += item.relevancePercent * 0.05;
  }

  return score;
}

function meetsSearchPriority(
  admin: number | null | undefined,
  ml: number | null | undefined,
  min: number
): boolean {
  if (admin != null && Number.isFinite(Number(admin))) return Number(admin) >= min;
  if (ml != null && Number.isFinite(Number(ml))) return Number(ml) >= min;
  return false;
}

async function loadJournalCatalog(
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<string[]> {
  if (journalCatalog && Date.now() - journalCatalog.at < JOURNAL_CATALOG_MS) {
    return journalCatalog.names;
  }
  const names = new Set<string>();
  const page = 1000;
  for (let from = 0; from < 20000; from += page) {
    const { data, error } = await supabase
      .from("articles")
      .select("pmid, journal")
      .not("journal", "is", null)
      .order("pmid", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const journal = String(row.journal ?? "").trim();
      if (journal) names.add(journal);
    }
    if (data.length < page) break;
  }
  const list = [...names];
  journalCatalog = { at: Date.now(), names: list };
  return list;
}

async function searchOneJournal(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  names: string[],
  limit: number
): Promise<BriefItem[]> {
  const articles: {
    pmid: string;
    release_date: string | null;
    pub_date: string | null;
  }[] = [];
  const page = 1000;
  for (let from = 0; from < 5000; from += page) {
    const { data, error } = await supabase
      .from("articles")
      .select("pmid, release_date, pub_date")
      .in("journal", names)
      .order("pmid", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      articles.push({
        pmid: String(row.pmid ?? ""),
        release_date: row.release_date ?? null,
        pub_date: row.pub_date ?? null,
      });
    }
    if (data.length < page) break;
  }
  if (articles.length === 0) return [];

  const dates = new Map<string, string>();
  for (const row of articles) {
    const pmid = row.pmid.trim();
    if (!pmid) continue;
    dates.set(pmid, row.release_date || row.pub_date || "");
  }

  const eligible = new Set<string>();
  const pmids = [...dates.keys()];
  for (let i = 0; i < pmids.length; i += 80) {
    const slice = pmids.slice(i, i + 80);
    const { data, error } = await supabase
      .from("summaries")
      .select("pmid, admin_priority, ml_priority")
      .in("pmid", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (
        meetsSearchPriority(row.admin_priority, row.ml_priority, 5) &&
        row.pmid
      ) {
        eligible.add(String(row.pmid));
      }
    }
  }

  const ordered = [...eligible].sort((a, b) => {
    const dateB = dates.get(b) ?? "";
    const dateA = dates.get(a) ?? "";
    if (dateB !== dateA) return dateB.localeCompare(dateA);
    return b.localeCompare(a);
  });

  return getBriefItemsForSaved(
    ordered.slice(0, limit).map((pmid) => ({
      pmid,
      title: `PMID ${pmid}`,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }))
  );
}

/**
 * Searches the article corpus by title, abstract, author, or journal name.
 *
 * Rules:
 * - Only includes articles with priority rating >= 5 (effective priority: admin override or ML grade).
 * - A query that names one journal returns only that journal, newest first.
 * - Other queries sort by search relevance descending.
 * - Minimal egress: queries lightweight columns/PMIDs first, then hydrates winners.
 */
export async function searchBriefArticles(
  rawQuery: string,
  limit: number = 40
): Promise<BriefSearchResult> {
  const query = rawQuery.trim();
  if (!query) return { items: [], mode: "text", journalNames: null };

  const supabase = getSupabaseServerClient();

  let journalNames: string[] | null = null;
  try {
    const catalog = await loadJournalCatalog(supabase);
    journalNames = journalsForQuery(catalog, query);
  } catch (err) {
    console.warn(
      "[search] journal lookup failed:",
      err instanceof Error ? err.message : err
    );
  }
  if (journalNames) {
    const items = await searchOneJournal(
      supabase,
      journalNames,
      Math.max(limit, JOURNAL_SEARCH_LIMIT)
    );
    return { items, mode: "journal", journalNames };
  }

  const directPmid = sanitizePmid(query);

  // If query is an exact PMID, prioritize direct lookup
  if (directPmid) {
    const directItems = await getBriefItemsForSaved([
      {
        pmid: directPmid,
        title: `PMID ${directPmid}`,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${directPmid}/`,
      },
    ]);
    const eligible = directItems.filter((i) => i.effectivePriority >= 5);
    if (eligible.length > 0) return { items: eligible, mode: "text", journalNames: null };
  }

  const ftsRankMap = new Map<string, number>();
  let candidatePmids: string[] = [];

  // Try the RPC function first if available
  try {
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      "search_brief_articles",
      {
        search_query: query,
        min_priority: 5,
        result_limit: Math.max(limit * 2, 80),
      }
    );

    if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
      for (const row of rpcRows) {
        const pmid = String(row.pmid ?? "");
        if (pmid) {
          candidatePmids.push(pmid);
          if (typeof row.fts_rank === "number") {
            ftsRankMap.set(pmid, row.fts_rank);
          }
        }
      }
    }
  } catch {
    // RPC not available or failed; continue to standard query
  }

  // Fallback to textSearch on articles fts GIN index if RPC produced no candidates
  if (candidatePmids.length === 0) {
    const { data: ftsRows } = await supabase
      .from("articles")
      .select("pmid")
      .textSearch("fts", query, { type: "websearch", config: "english" })
      .limit(Math.max(limit * 3, 100));

    if (ftsRows && ftsRows.length > 0) {
      candidatePmids = ftsRows.map((r) => String(r.pmid));
    } else {
      // Fallback to ILIKE for partial words or special symbols
      const cleanPattern = query.replace(/[%_,]/g, " ").trim();
      if (cleanPattern) {
        const { data: ilikeRows } = await supabase
          .from("articles")
          .select("pmid")
          .or(`title.ilike.%${cleanPattern}%,abstract.ilike.%${cleanPattern}%`)
          .limit(Math.max(limit * 3, 100));

        if (ilikeRows) {
          candidatePmids = ilikeRows.map((r) => String(r.pmid));
        }
      }
    }
  }

  // Author names are not in the title/abstract index. Merge those ids
  // so a name still matches when the RPC already returned other papers.
  try {
    const { data: authorRows, error: authorError } = await supabase.rpc(
      "search_article_author_pmids",
      {
        search_query: query,
        result_limit: Math.min(40, Math.max(limit, 20)),
      }
    );
    if (!authorError && Array.isArray(authorRows)) {
      for (const row of authorRows) {
        const pmid = String(row.pmid ?? "");
        if (pmid && !candidatePmids.includes(pmid)) candidatePmids.push(pmid);
      }
    }
  } catch {
    // Author lookup is optional if the function is not installed yet.
  }

  if (candidatePmids.length === 0) return { items: [], mode: "text", journalNames: null };

  const uniquePmids = [...new Set(candidatePmids)];

  // Hydrate candidate brief items
  const hydrated = await getBriefItemsForSaved(
    uniquePmids.map((pmid) => ({
      pmid,
      title: `PMID ${pmid}`,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }))
  );

  // STRICT REQUIREMENT: Only include those 5 or more on priority rating
  const priorityEligible = hydrated.filter((item) => item.effectivePriority >= 5);

  // STRICT REQUIREMENT: Sort strictly by relevance descending
  priorityEligible.sort((a, b) => {
    const scoreB = computeSearchRelevance(b, query, ftsRankMap.get(b.pmid));
    const scoreA = computeSearchRelevance(a, query, ftsRankMap.get(a.pmid));
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // Newer publication date tie-breaker
    const dateB = b.date ?? "";
    const dateA = a.date ?? "";
    return dateB.localeCompare(dateA);
  });

  return { items: priorityEligible.slice(0, limit), mode: "text", journalNames: null };
}
