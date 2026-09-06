import "server-only";
import { getDefaultTopicId, type FeedItem } from "@/lib/feed";
import type { BriefItem } from "@/lib/brief/items";
import {
  formatStudyLabel,
  getItemSetting,
  getItemSettings,
  normalizeScoreTo100,
  parseSummaryBullets,
} from "@/lib/filters";
import type { ArticleSetting } from "@/lib/classifySetting";
import type { ArticleTopic } from "@/lib/classifyTopic";
import type { WhoRegion } from "@/lib/classifyWhoRegion";
import { isHighImpactJournal, lookupJif } from "@/lib/jif";
import { isQ1Journal, lookupScimago } from "@/lib/scimago";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { articleExternalUrl } from "@/lib/feedSource";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";
import { resolveStoredHeadline } from "@/lib/brief/ensureHeadlines";
import { getItemTopics } from "@/lib/brief/topicFilter";
import { getItemWhoRegions } from "@/lib/brief/whoRegionFilter";
import { effectivePriority } from "@/lib/brief/priority";
import type { SavedBriefItem } from "@/lib/savedArticleTypes";
import { sanitizePmid } from "@/lib/savedArticleTypes";

const CHUNK = 80;

type SavedSummaryRow = {
  pmid: string;
  headline?: string | null;
  created_at: string;
  subheading?: string | null;
  label?: string | null;
  admin_priority?: number | null;
  ml_priority?: number | null;
  rank_score?: number | null;
  admin_setting?: string | null;
  auto_settings?: string[] | null;
  auto_topics?: string[] | null;
  auto_who_regions?: string[] | null;
  summary_text?: string | null;
  articles?: {
    title?: string | null;
    journal?: string | null;
    pub_date?: string | null;
    release_date?: string | null;
    fetched_at?: string | null;
    publication_types?: string[] | null;
    keywords?: string[] | null;
    mesh_terms?: string[] | null;
    authors?: string[] | null;
    abstract?: string | null;
    source?: string | null;
  } | null;
};

function parseAdminSettingValue(
  raw: string | null | undefined
): ArticleSetting | null {
  const s = raw?.trim();
  if (
    s === "hospital" ||
    s === "community" ||
    s === "long-term care" ||
    s === "animal" ||
    s === "environment"
  ) {
    return s;
  }
  return null;
}

function parseStoredMlPriority(raw: unknown): number | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Math.round(Number(raw));
  return n >= 1 && n <= 10 ? n : null;
}

function isWithinHours(iso: string, hours: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000;
}

function rowToBriefItem(row: SavedSummaryRow): BriefItem | null {
  const titleRaw = row.articles?.title?.trim();
  if (!titleRaw) return null;
  const title = decodeHtmlEntities(titleRaw);
  const summaryText = row.summary_text?.trim() ?? "";
  const abstract = row.articles?.abstract?.trim()
    ? decodeHtmlEntities(row.articles.abstract.trim())
    : "";
  const keywords = Array.isArray(row.articles?.keywords)
    ? row.articles!.keywords!
    : [];
  const meshTerms = Array.isArray(row.articles?.mesh_terms)
    ? row.articles!.mesh_terms!
    : [];
  const authors = (row.articles?.authors ?? [])
    .map((a) => String(a).trim())
    .filter(Boolean);

  const bullets = summaryText ? parseSummaryBullets(summaryText) : null;
  const scimago = lookupScimago(row.articles?.journal);
  const jifIsHigh =
    Boolean(scimago) ||
    isQ1Journal(row.articles?.journal) ||
    isHighImpactJournal(row.articles?.journal);
  const jifEntry = lookupJif(row.articles?.journal);
  const adminSetting = parseAdminSettingValue(row.admin_setting);
  const autoSettings = Array.isArray(row.auto_settings)
    ? (row.auto_settings
        .map((s) => String(s ?? "").trim())
        .filter(Boolean) as ArticleSetting[])
    : null;
  const autoTopics = Array.isArray(row.auto_topics)
    ? (row.auto_topics
        .map((s) => String(s ?? "").trim())
        .filter(Boolean) as ArticleTopic[])
    : null;
  const autoWhoRegions = Array.isArray(row.auto_who_regions)
    ? (row.auto_who_regions
        .map((s) => String(s ?? "").trim())
        .filter(Boolean) as WhoRegion[])
    : null;

  const storedMl = parseStoredMlPriority(row.ml_priority);
  const predictedPriority =
    row.admin_priority != null
      ? row.admin_priority
      : (storedMl ?? 5);
  const prioritySource: BriefItem["prioritySource"] =
    row.admin_priority != null ? "admin" : storedMl != null ? "model" : "fallback";
  const storedRank =
    row.rank_score != null && Number.isFinite(Number(row.rank_score))
      ? Number(row.rank_score)
      : null;
  const studyLabelRaw = [row.subheading, row.label].filter(Boolean).join(" · ");
  const studyLabel = formatStudyLabel(studyLabelRaw || null);
  const abstractSnippet = abstract
    ? abstract.length > 1200
      ? `${abstract.slice(0, 1200)}…`
      : abstract
    : null;

  const feedLike: FeedItem = {
    pmid: row.pmid,
    summary_text: summaryText || null,
    created_at: row.created_at,
    rank_score: storedRank,
    subheading: row.subheading ?? null,
    label: row.label ?? null,
    jif_2024: jifEntry?.jif ?? null,
    source: "pubmed",
    admin_priority: row.admin_priority ?? null,
    ml_priority: storedMl,
    admin_setting: adminSetting,
    auto_settings: autoSettings,
    is_q1: Boolean(scimago) || isQ1Journal(row.articles?.journal),
    sjr_scimago: scimago?.sjr ?? null,
    articles: {
      title,
      abstract: abstract || null,
      journal: row.articles?.journal ?? null,
      pub_date: row.articles?.pub_date ?? null,
      release_date: row.articles?.release_date ?? null,
      fetched_at: row.articles?.fetched_at ?? null,
      publication_types: row.articles?.publication_types ?? null,
      keywords,
      mesh_terms: meshTerms,
      source: row.articles?.source ?? null,
    },
  };

  return {
    pmid: row.pmid,
    source: "pubmed",
    headline: resolveStoredHeadline(row.headline, summaryText, title),
    title,
    journal: row.articles?.journal?.trim() ?? null,
    jif: jifEntry?.jif ?? null,
    jifIsHigh,
    isQ1: Boolean(scimago) || isQ1Journal(row.articles?.journal),
    sjrScimago: scimago?.sjr ?? null,
    date: row.articles?.release_date ?? row.articles?.pub_date ?? null,
    createdAt: row.created_at,
    fetchedAt: row.articles?.fetched_at ?? null,
    isNew: isWithinHours(row.created_at, 24),
    setting: getItemSetting(feedLike),
    settings: getItemSettings(feedLike),
    adminSetting,
    autoTopics,
    topics: getItemTopics({
      autoTopics,
      title,
      keywords,
      meshTerms,
      abstractSnippet,
    }),
    autoWhoRegions,
    whoRegions: getItemWhoRegions({
      autoWhoRegions,
      title,
      keywords,
      meshTerms,
      abstractSnippet,
    }),
    studyLabel: studyLabel || null,
    methods: bullets?.methods ?? null,
    results: bullets?.results ?? null,
    bottomLine: bullets?.bottomLine ?? null,
    relevancePercent: storedRank != null ? normalizeScoreTo100(storedRank) : 0,
    predictedPriority,
    adminPriority: row.admin_priority ?? null,
    effectivePriority: effectivePriority(row.admin_priority, predictedPriority),
    prioritySource,
    pubmedUrl: articleExternalUrl(row.pmid, "pubmed"),
    authors,
    keywords: keywords.slice(0, 8),
    meshTerms: meshTerms.slice(0, 12),
    abstractSnippet,
  };
}

function fallbackBriefItem(saved: SavedBriefItem): BriefItem {
  const title = saved.title || `PMID ${saved.pmid}`;
  return {
    pmid: saved.pmid,
    source: "pubmed",
    headline: title,
    title,
    journal: null,
    jif: null,
    jifIsHigh: false,
    isQ1: false,
    sjrScimago: null,
    date: null,
    createdAt: new Date(0).toISOString(),
    fetchedAt: null,
    isNew: false,
    setting: null,
    settings: [],
    adminSetting: null,
    autoTopics: null,
    topics: [],
    autoWhoRegions: null,
    whoRegions: [],
    studyLabel: null,
    methods: null,
    results: null,
    bottomLine: null,
    relevancePercent: 0,
    predictedPriority: 5,
    adminPriority: null,
    effectivePriority: 5,
    prioritySource: "fallback",
    pubmedUrl: saved.pubmedUrl,
    authors: [],
    keywords: [],
    meshTerms: [],
    abstractSnippet: null,
  };
}

const SELECT =
  "pmid, headline, created_at, subheading, label, admin_priority, admin_setting, auto_settings, auto_topics, auto_who_regions, ml_priority, rank_score, summary_text, articles!inner(title, journal, pub_date, release_date, fetched_at, publication_types, keywords, mesh_terms, authors, abstract, source)";

/**
 * Load Brief-shaped stories for an ordered list of saved PMIDs.
 * Only those IDs are fetched (bounded; no Brief date/priority gates).
 */
export async function getBriefItemsForSaved(
  saved: SavedBriefItem[]
): Promise<BriefItem[]> {
  const ordered = saved
    .map((s) => sanitizePmid(s.pmid))
    .filter((pmid): pmid is string => Boolean(pmid));
  if (ordered.length === 0) return [];

  const topicId = await getDefaultTopicId();
  const byPmid = new Map<string, BriefItem>();

  if (topicId) {
    const supabase = getSupabaseServerClient();
    for (let i = 0; i < ordered.length; i += CHUNK) {
      const chunk = ordered.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("summaries")
        .select(SELECT)
        .eq("topic_id", topicId)
        .in("pmid", chunk);

      if (error) {
        console.warn("[savedBriefItems] load failed:", error.message);
        continue;
      }

      for (const row of (data ?? []) as SavedSummaryRow[]) {
        const item = rowToBriefItem(row);
        if (item) byPmid.set(item.pmid, item);
      }
    }
  }

  return ordered.map((pmid) => {
    const found = byPmid.get(pmid);
    if (found) return found;
    const meta = saved.find((s) => s.pmid === pmid);
    return fallbackBriefItem(
      meta ?? {
        pmid,
        title: `PMID ${pmid}`,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      }
    );
  });
}
