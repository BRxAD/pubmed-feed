import "server-only";
import { getDefaultTopicId } from "@/lib/feed";
import { lookupJif } from "@/lib/jif";
import { lookupScimago } from "@/lib/scimago";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  pickJournalTopLists,
  type JournalTopArticle,
  type JournalTopSummary,
} from "@/lib/brief/journalTopLists";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import type { BriefTopicFilter } from "@/lib/brief/topicFilter";
import type { BriefWhoRegionFilter } from "@/lib/brief/whoRegionFilter";
import type { TopCitedItem } from "@/lib/brief/topCited";
import {
  TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
  TOP_PRIORITY_MIN_PRIORITY,
  type TopPriorityItem,
} from "@/lib/brief/topPriority";

type ArticleRow = {
  pmid: string;
  title: string | null;
  journal: string | null;
  pub_date: string | null;
  release_date: string | null;
  cited_by_count: number | null;
  source: string | null;
  doi: string | null;
  openalex_id: string | null;
  landing_url: string | null;
};

type SummaryRow = {
  pmid: string;
  headline: string | null;
  admin_priority: number | null;
  ml_priority: number | null;
  rank_score: number | null;
  admin_setting: string | null;
  auto_settings: string[] | null;
  auto_topics: string[] | null;
  auto_who_regions: string[] | null;
};

async function loadArticles(names: string[]): Promise<ArticleRow[]> {
  const supabase = getSupabaseServerClient();
  const rows: ArticleRow[] = [];
  const page = 1000;
  for (let from = 0; from < 5000; from += page) {
    const { data, error } = await supabase
      .from("articles")
      .select(
        "pmid, title, journal, pub_date, release_date, cited_by_count, source, doi, openalex_id, landing_url"
      )
      .in("journal", names)
      .order("pmid", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as ArticleRow[]));
    if (data.length < page) break;
  }
  return rows;
}

async function loadSummaries(pmids: string[]): Promise<SummaryRow[]> {
  if (pmids.length === 0) return [];
  const topicId = await getDefaultTopicId();
  if (!topicId) return [];
  const supabase = getSupabaseServerClient();
  const rows: SummaryRow[] = [];
  for (let i = 0; i < pmids.length; i += 80) {
    const slice = pmids.slice(i, i + 80);
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, headline, admin_priority, ml_priority, rank_score, admin_setting, auto_settings, auto_topics, auto_who_regions"
      )
      .eq("topic_id", topicId)
      .in("pmid", slice);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SummaryRow[]));
  }
  return rows;
}

/**
 * Top 10 relevance and Top 10 cited limited to one journal.
 * Slim columns only (no abstracts). Same year window as the homepage lists.
 */
export async function loadJournalTopLists(
  journalNames: string[],
  setting: BriefSettingFilter = "",
  topic: BriefTopicFilter = "",
  region: BriefWhoRegionFilter = ""
): Promise<{ priority: TopPriorityItem[]; cited: TopCitedItem[] }> {
  const names = [...new Set(journalNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) return { priority: [], cited: [] };

  const articles = await loadArticles(names);
  const summaries = await loadSummaries(articles.map((row) => row.pmid));

  const preparedArticles: JournalTopArticle[] = articles.map((row) => {
    const journal = row.journal?.trim() || null;
    return {
      pmid: row.pmid,
      title: row.title,
      journal,
      pubDate: row.pub_date,
      releaseDate: row.release_date,
      citedByCount: row.cited_by_count,
      source: row.source,
      doi: row.doi,
      openalexId: row.openalex_id,
      landingUrl: row.landing_url,
      jif: lookupJif(journal)?.jif ?? null,
      sjr: lookupScimago(journal)?.sjr ?? null,
    };
  });

  const preparedSummaries: JournalTopSummary[] = summaries.map((row) => ({
    pmid: row.pmid,
    headline: row.headline,
    adminPriority: row.admin_priority,
    mlPriority: row.ml_priority,
    rankScore: row.rank_score,
    adminSetting: row.admin_setting,
    autoSettings: row.auto_settings,
    autoTopics: row.auto_topics,
    autoWhoRegions: row.auto_who_regions,
  }));

  return pickJournalTopLists({
    articles: preparedArticles,
    summaries: preparedSummaries,
    nowMs: Date.now(),
    windowDays: TOP_PRIORITY_ARTICLE_WINDOW_DAYS,
    minPriority: TOP_PRIORITY_MIN_PRIORITY,
    setting,
    topic,
    region,
  });
}
