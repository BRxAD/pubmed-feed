import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizePmid } from "@/lib/savedArticleTypes";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import type { BriefItem } from "@/lib/brief/items";

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
  const summaryText = `${item.methods || ""} ${item.results || ""} ${bottomLine}`.toLowerCase();

  // 2. Exact phrase match in title or headline
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

    const allInSummary = terms.every(
      (t) => summaryText.includes(t) || titleHeadline.includes(t)
    );
    if (allInSummary) score += 30;
  }

  for (const term of terms) {
    if (titleHeadline.includes(term)) {
      score += 25;
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

/**
 * Searches the PubMed article corpus by title and abstract.
 *
 * Rules:
 * - Only includes articles with priority rating >= 5 (effective priority: admin override or ML grade).
 * - Sorts results strictly by search relevance descending.
 * - Minimal egress: queries lightweight columns/PMIDs first, then hydrates winners.
 */
export async function searchBriefArticles(
  rawQuery: string,
  limit: number = 40
): Promise<BriefItem[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const supabase = getSupabaseServerClient();
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
    if (eligible.length > 0) return eligible;
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

  if (candidatePmids.length === 0) return [];

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

  return priorityEligible.slice(0, limit);
}
