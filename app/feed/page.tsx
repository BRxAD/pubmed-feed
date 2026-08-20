import { Suspense } from "react";
import {
  getFeedItems,
  getDefaultTopicId,
  getTrendingKeywords,
  parseFeedSort,
  type FeedItem,
  type FeedSort,
} from "@/lib/feed";
import {
  computeBreakdown,
  type RankingWeights,
  type ScoringOptions,
} from "@/lib/ranking";
import {
  normalizeScoreTo100,
  formatStudyLabel,
  keywordColorClasses,
  studyAccentClass,
  parseSummaryBullets,
  getItemSettings,
  getAutoItemSettings,
  type ArticleSetting,
} from "@/lib/filters";
import {
  ARTICLE_SETTING_LABELS,
  ARTICLE_SETTING_ORDER,
} from "@/lib/classifySetting";
import { lookupJif, isHighImpactJournal } from "@/lib/jif";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import FeedNav from "@/components/FeedNav";
import RelevanceSlider from "@/components/RelevanceSlider";
import AdminPrioritySelector from "@/components/AdminPrioritySelector";
import AdminSettingSelector from "@/components/AdminSettingSelector";
import { snapshotFromBreakdown } from "@/lib/relevanceLearning";
import { loadPriorityModel, type PriorityModel } from "@/lib/brief/priorityModel";
import { explainArticlePriority } from "@/lib/brief/priorityExplain";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { loadLastIngestStats } from "@/lib/ingestStats";
import { getCachedHumanRatedTotal } from "@/lib/humanRatingStats";
import {
  articleExternalUrl,
  parseFeedSource,
  type FeedSourceFilter,
} from "@/lib/feedSource";
import {
  toPenaltyWeights,
  toRankingWeights,
} from "@/lib/brief/feedSettings";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import FeedUnlock from "@/components/FeedUnlock";
import NewsApprovalQueue from "@/components/brief/NewsApprovalQueue";

const MAX_KEYWORD_CHIPS = 5;
const KEYWORD_TRUNCATE_LEN = 26;
const BASE_PATH = "/feed";

function buildFeedUrl(params: {
  topicId: string;
  sort?: FeedSort;
  keyword?: string;
  page?: number;
  minRelevance?: number;
  setting?: ArticleSetting | "";
  admin?: boolean;
  source?: FeedSourceFilter;
  minPriority?: number;
  unratedOnly?: boolean;
  secret?: string;
}): string {
  const q = new URLSearchParams();
  q.set("topicId", params.topicId);
  if (params.source && params.source !== "all") q.set("source", params.source);
  if (params.sort) q.set("sort", params.sort);
  else q.set("sort", "ingested");
  if (params.keyword?.trim()) q.set("keyword", params.keyword.trim());
  if (params.page != null && params.page > 1) q.set("page", String(params.page));
  if (params.minRelevance && params.minRelevance > 0)
    q.set("minRelevance", String(params.minRelevance));
  if (params.minPriority && params.minPriority > 0)
    q.set("minPriority", String(params.minPriority));
  if (params.setting) q.set("setting", params.setting);
  if (params.unratedOnly) q.set("unrated", "1");
  // Unlocked feed is always admin; keep admin=1 on all in-app links.
  q.set("admin", "1");
  if (params.secret?.trim()) q.set("secret", params.secret.trim());
  return `${BASE_PATH}?${q.toString()}`;
}

const SETTING_BADGE_CLASSES: Record<ArticleSetting, string> = {
  hospital: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  community:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "long-term care":
    "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  dentistry: "bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "one-health":
    "bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "global-health":
    "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  animal: "bg-lime-50 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
  environment: "bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

function makeRec(item: FeedItem): PubMedRecord {
  return {
    pmid: item.pmid,
    title: item.articles?.title ?? null,
    abstract: item.articles?.abstract ?? null,
    journal: item.articles?.journal ?? null,
    pubDate: item.articles?.pub_date ?? null,
    publicationTypes: item.articles?.publication_types ?? [],
    meshTerms: item.articles?.mesh_terms ?? [],
    keywords: item.articles?.keywords ?? [],
    authors: [],
  };
}

function getItemLiveScore(
  item: FeedItem,
  query_string: string,
  weights: RankingWeights,
  scoringOptions: ScoringOptions
): number {
  const jifIsHigh =
    item.is_q1 || isHighImpactJournal(item.articles?.journal);
  return computeBreakdown(
    query_string,
    makeRec(item),
    weights,
    true,
    jifIsHigh,
    scoringOptions
  ).finalScore;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatIngestEastern(iso: string | null): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "not yet";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Feature values span 0/1 flags, 0–1 ratios, and raw term counts in the tens. */
function formatFeatureValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

// ── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({
  item,
  query_string,
  topicId,
  sort,
  keyword,
  minRelevance,
  minPriority,
  setting,
  unratedOnly,
  isAdmin,
  weights,
  scoringOptions,
  source,
  priorityModel,
  embedding,
  secret,
}: {
  item: FeedItem;
  query_string: string;
  topicId: string;
  sort: FeedSort;
  keyword: string;
  minRelevance: number;
  minPriority: number;
  setting: ArticleSetting | "";
  unratedOnly: boolean;
  isAdmin: boolean;
  weights: RankingWeights;
  scoringOptions: ScoringOptions;
  source: FeedSourceFilter;
  priorityModel: PriorityModel | null;
  embedding?: number[] | null;
  secret: string;
}) {
  const journal = item.articles?.journal != null ? String(item.articles.journal) : "";
  const pubDateStr = formatDate(
    item.articles?.release_date ?? item.articles?.pub_date
  );
  const ingestedStr = formatDate(
    item.articles?.fetched_at ?? item.created_at
  );
  const dateStr = pubDateStr || ingestedStr;
  const articleUrl = articleExternalUrl(item.pmid, item.source);

  const jifEntry = lookupJif(item.articles?.journal);
  const jifIsHigh =
    item.is_q1 ||
    (jifEntry != null && isHighImpactJournal(item.articles?.journal));
  const breakdown = computeBreakdown(
    query_string,
    makeRec(item),
    weights,
    true,
    jifIsHigh,
    scoringOptions
  );
  // Always use live settings-based score (ignore stored rank_score).
  const score = breakdown.finalScore;
  const normalizedScore = normalizeScoreTo100(score);

  /** Canonical ML grade: ingest-time score (handcrafted + embeddings). */
  const storedMlPriority = item.ml_priority;
  // Feature breakdown only — emb PCA dims are zero here (no page-load embeddings).
  const priorityPrediction = isAdmin
    ? explainArticlePriority({
        rec: makeRec(item),
        queryString: query_string,
        weights,
        model: priorityModel,
        embedding: embedding ?? null,
      })
    : null;

  const studyLabelDisplay = [
    formatStudyLabel(item.subheading),
    formatStudyLabel(item.label),
  ]
    .filter(Boolean)
    .join(" · ");

  const accentClass = studyAccentClass(
    item.articles?.publication_types,
    item.label,
    item.subheading
  );

  const keywords = (item.articles?.keywords ?? [])
    .filter((k): k is string => typeof k === "string" && k.trim() !== "")
    .slice(0, MAX_KEYWORD_CHIPS);

  const bullets = parseSummaryBullets(item.summary_text);
  const jifStr = jifEntry ? jifEntry.jif.toFixed(1) : null;
  const itemSettings = getItemSettings(item);

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border border-zinc-200/70 bg-white pl-5 pr-5 pt-5 pb-4 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-zinc-300 dark:border-zinc-700/60 dark:bg-zinc-900/80 dark:hover:border-zinc-600 dark:hover:shadow-zinc-900/60 border-l-4 ${accentClass}`}
    >
      {/* Title */}
      <h2 className="text-xl font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
        <a
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {item.articles?.title ?? "Untitled"}
        </a>
      </h2>

      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {journal && (
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 italic">
            {journal}
          </span>
        )}
        {pubDateStr && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            Pub {pubDateStr}
          </span>
        )}
        {ingestedStr && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            Ingested {ingestedStr}
          </span>
        )}
        {!pubDateStr && !ingestedStr && dateStr && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">{dateStr}</span>
        )}
        {studyLabelDisplay && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {studyLabelDisplay}
          </span>
        )}
        {jifStr && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            JIF {jifStr}
          </span>
        )}
        {item.is_q1 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Q1
            {item.sjr_scimago != null
              ? ` · SJR ${item.sjr_scimago.toFixed(2)}`
              : ""}
          </span>
        )}
        {itemSettings.map((s) => (
          <span
            key={s}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SETTING_BADGE_CLASSES[s]}`}
          >
            {ARTICLE_SETTING_LABELS[s]}
          </span>
        ))}
      </div>

      {/* Summary bullets */}
      {bullets ? (
        <div className="mt-4 space-y-2.5">
          {bullets.methods && (
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <span className="mr-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Methods
              </span>
              {bullets.methods}
            </p>
          )}
          {bullets.results && (
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <span className="mr-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Results
              </span>
              {bullets.results}
            </p>
          )}
          {bullets.bottomLine && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2.5 dark:bg-amber-950/40">
              <p className="text-sm font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
                <span className="mr-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Bottom line
                </span>
                {bullets.bottomLine}
              </p>
            </div>
          )}
        </div>
      ) : item.summary_text ? (
        <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {item.summary_text}
        </p>
      ) : null}

      {/* Abstract toggle */}
      {item.articles?.abstract && (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer select-none list-none text-xs font-medium text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <span className="group-open/details:hidden">Read abstract ↓</span>
            <span className="hidden group-open/details:inline">Hide abstract ↑</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {item.articles.abstract}
          </p>
        </details>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {keywords.map((kw) => {
            const display =
              kw.length > KEYWORD_TRUNCATE_LEN ? kw.slice(0, KEYWORD_TRUNCATE_LEN - 1) + "…" : kw;
            return (
              <a
                key={`${item.pmid}-${kw}`}
                href={buildFeedUrl({
                  topicId,
                  sort,
                  keyword: kw,
                  page: 1,
                  minRelevance,
                  minPriority,
                  setting: setting || undefined,
                  unratedOnly,
                  admin: isAdmin || undefined,
                  source,
                  secret,
                })}
                title={kw}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition hover:opacity-90 ${keywordColorClasses(kw)}`}
              >
                {display}
              </a>
            );
          })}
        </div>
      )}

      {/* Admin panel */}
      {isAdmin && (
        <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/60 p-3 text-xs dark:border-amber-800/40 dark:bg-amber-950/30">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Admin · Priority model
            </p>
            {storedMlPriority != null ? (
              <>
                <div
                  className="h-1.5 w-20 rounded-full bg-zinc-200 dark:bg-zinc-600"
                  role="presentation"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                    style={{
                      width: `${(storedMlPriority / 10) * 100}%`,
                    }}
                  />
                </div>
                <span className="tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {storedMlPriority}/10
                </span>
                <span className="tabular-nums text-zinc-400">
                  ML (ingest)
                  {" · "}
                  relevance {normalizedScore}/100
                </span>
              </>
            ) : (
              <span className="tabular-nums text-zinc-400">
                ML unset · relevance {normalizedScore}/100
              </span>
            )}
          </div>

          {/* Feature sketch — embeddings not loaded on page (egress); score above is stored. */}
          <details className="mb-2 rounded-md border border-zinc-200/70 open:bg-white/40 dark:border-zinc-700/60 dark:open:bg-zinc-900/40">
            <summary className="cursor-pointer select-none px-2 py-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-zinc-400 marker:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              {priorityPrediction
                ? `Feature sketch · ${priorityPrediction.contributions.length} features · embeddings not loaded`
                : "Feature sketch · unavailable"}
            </summary>
            <div className="space-y-1.5 px-2 pb-2 text-zinc-500 dark:text-zinc-400">
              {priorityPrediction &&
              (priorityPrediction.source === "model" ||
                priorityPrediction.source === "fallback") ? (
                <div className="overflow-hidden rounded-md border border-zinc-200/70 dark:border-zinc-700/60">
                  <table className="w-full table-fixed border-collapse text-left">
                    <thead>
                      <tr className="bg-zinc-100/70 text-[0.65rem] uppercase tracking-wide text-zinc-400 dark:bg-zinc-800/60">
                        <th className="px-2 py-1 font-medium">Feature</th>
                        <th className="w-16 px-2 py-1 text-right font-medium">
                          Value
                        </th>
                        <th className="w-16 px-2 py-1 text-right font-medium">
                          Weight
                        </th>
                        <th className="w-16 px-2 py-1 text-right font-medium">
                          Effect
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {priorityPrediction.contributions.map((f) => (
                        <tr
                          key={f.name}
                          className="border-t border-zinc-200/60 dark:border-zinc-700/50"
                        >
                          <td className="px-2 py-1 text-zinc-600 dark:text-zinc-300">
                            {f.label}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatFeatureValue(f.value)}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-zinc-400">
                            {f.weight >= 0 ? "+" : ""}
                            {f.weight.toFixed(2)}
                          </td>
                          <td
                            className={`px-2 py-1 text-right tabular-nums font-semibold ${
                              f.contribution > 0.005
                                ? "text-green-700 dark:text-green-400"
                                : f.contribution < -0.005
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-zinc-400"
                            }`}
                          >
                            {f.contribution >= 0 ? "+" : ""}
                            {f.contribution.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-300 bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-800/40">
                        <td
                          className="px-2 py-1 text-zinc-500 dark:text-zinc-400"
                          colSpan={3}
                        >
                          Live sketch (no embeddings) — not the ML grade
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                          {storedMlPriority != null
                            ? `${storedMlPriority}/10 stored`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-zinc-400">
                  Priority explanation unavailable for this article.
                </p>
              )}
            </div>
          </details>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-zinc-500 dark:text-zinc-400">
            <span>
              Impact factor:{" "}
              <strong className={jifStr ? (jifIsHigh ? "text-green-700 dark:text-green-400" : "text-zinc-700 dark:text-zinc-300") : "text-zinc-400"}>
                {jifStr ? `${jifStr}${jifIsHigh ? " ★" : ""}` : "—"}
              </strong>
            </span>
            <span>
              PMID:{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">{item.pmid}</strong>
            </span>
            {item.articles?.publication_types?.length ? (
              <span className="col-span-2">
                Pub types:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {item.articles.publication_types.join(", ")}
                </strong>
              </span>
            ) : null}
            {studyLabelDisplay && (
              <span className="col-span-2">
                Classified as:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {studyLabelDisplay}
                </strong>
              </span>
            )}
            {item.admin_priority != null && (
              <span>
                Saved priority:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {item.admin_priority}/10
                </strong>
              </span>
            )}
            {storedMlPriority != null ? (
              <span>
                ML priority:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {storedMlPriority}/10
                </strong>
                <span className="text-zinc-400"> (ingest · with embeddings)</span>
              </span>
            ) : (
              <span className="text-zinc-400">ML priority: unset</span>
            )}
            {item.admin_priority == null && (
              <span className="text-zinc-400">Saved priority: unset</span>
            )}
          </div>

          <AdminPrioritySelector
            topicId={topicId}
            pmid={item.pmid}
            initialPriority={item.admin_priority}
            featureSnapshot={snapshotFromBreakdown(breakdown)}
            refreshAfterSave={unratedOnly}
          />
          <AdminSettingSelector
            topicId={topicId}
            pmid={item.pmid}
            autoSettings={getAutoItemSettings(item)}
            initialSetting={item.admin_setting}
            refreshAfterSave={Boolean(setting)}
          />
        </div>
      )}
    </article>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const VALID_SETTINGS = new Set<ArticleSetting>(ARTICLE_SETTING_ORDER);

function parseSettingParam(raw: string | undefined): ArticleSetting | "" {
  if (!raw) return "";
  return VALID_SETTINGS.has(raw as ArticleSetting) ? (raw as ArticleSetting) : "";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    topicId?: string;
    sort?: string;
    keyword?: string;
    page?: string;
    minRelevance?: string;
    minPriority?: string;
    setting?: string;
    admin?: string;
    source?: string;
    unrated?: string;
    secret?: string;
  }>;
}) {
  const {
    topicId: topicIdRaw,
    source: sourceRaw,
    sort: sortRaw,
    keyword: keywordRaw,
    page: pageRaw,
    minRelevance: minRelevanceRaw,
    minPriority: minPriorityRaw,
    setting: settingRaw,
    unrated: unratedRaw,
    secret: secretRaw,
  } = await searchParams;

  const feedSecret = secretRaw?.trim() ?? "";
  if (!verifyBriefAdminSecret(feedSecret)) {
    return <FeedUnlock />;
  }

  const source = parseFeedSource(sourceRaw);
  let topicId = topicIdRaw?.trim();
  const sort: FeedSort = parseFeedSort(sortRaw);
  const keyword = keywordRaw?.trim() ?? "";
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  // Secret-gated feed always opens in admin format (ratings, ML details, news queue).
  const isAdmin = true;
  // Min relevance filter is only available in admin mode
  const minRelevance = isAdmin
    ? Math.max(0, Math.min(100, parseFloat(minRelevanceRaw ?? "0") || 0))
    : 0;
  const minPriority = Math.max(
    0,
    Math.min(10, parseInt(minPriorityRaw ?? "0", 10) || 0)
  );
  const unratedOnly = unratedRaw === "1" || unratedRaw === "true";
  const setting = parseSettingParam(settingRaw);

  if (!topicId) {
    const defaultId = await getDefaultTopicId();
    if (!defaultId) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-zinc-500 dark:text-zinc-400">
            No default topic found. Provide a topicId, e.g. /feed?topicId=...
          </p>
        </div>
      );
    }
    topicId = defaultId;
  }

  const filters = {
    keyword: keyword || undefined,
    setting: setting || undefined,
    minPriority: minPriority > 0 ? minPriority : undefined,
    unratedOnly: unratedOnly || undefined,
  };

  let result: Awaited<ReturnType<typeof getFeedItems>>;
  try {
    result = await getFeedItems(topicId, 10, null, sort, filters, page, source);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load feed";
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-600 dark:text-red-400">{msg}</p>
      </div>
    );
  }

  const { items, query_string, totalCount, totalPages, page: currentPage, feedSettings } = result;
  const trendingKeywords = await getTrendingKeywords(topicId, source);

  const weights = toRankingWeights(feedSettings);
  const scoringOptions: ScoringOptions = {
    ...toPenaltyWeights(feedSettings),
    smallSampleMax: feedSettings.brief.smallSampleMax,
    largeStudyThreshold: feedSettings.brief.largeStudyThreshold,
  };

  let list = items.filter((item) => item.pmid);
  if (minRelevance > 0) {
    list = list.filter((item) => {
      const score = getItemLiveScore(item, query_string, weights, scoringOptions);
      return normalizeScoreTo100(score) >= minRelevance;
    });
  }

  const hasFilters =
    keyword !== "" ||
    minRelevance > 0 ||
    setting !== "" ||
    minPriority > 0 ||
    unratedOnly;

  const supabase = getSupabaseServerClient();
  const priorityModel = isAdmin
    ? await loadPriorityModel(supabase, topicId)
    : null;

  // Slim ingest stats only (counts + pmid/ml_priority slice) — no bodies.
  const [ingestStats, humanRatedTotal] = await Promise.all([
    loadLastIngestStats(supabase, topicId),
    getCachedHumanRatedTotal(topicId),
  ]);

  // Do not load embedding cache on feed page loads (egress). Admin ML badge
  // uses stored ml_priority; feature sketch runs without embeddings.
  const embeddingByPmid = new Map<string, number[] | null>();

  const lastIngestLabel = formatIngestEastern(ingestStats.lastAt);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      {/* Header: logo + rating total + admin toggle */}
      <header className="mb-4 flex items-start justify-between gap-4">
        {/* Logo — plain <a> so clicking always triggers a full reload */}
        <a
          href={buildFeedUrl({
            topicId: topicId!,
            admin: true,
            source,
            secret: feedSecret,
          })}
          className="inline-block shrink-0"
        >
          <img
            src="/logo-steward-feed.png?v=2"
            alt="StewardFeed"
            width={1080}
            height={288}
            className="h-[60px] w-auto max-w-full object-contain object-left dark:invert-0"
            style={{ background: "transparent" }}
          />
        </a>
        <div className="flex items-center gap-4">
          <p
            className="text-right text-sm tabular-nums text-zinc-500 dark:text-zinc-400"
            title="Cached about once a day — total summaries with a human priority rating"
          >
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">
              {humanRatedTotal.toLocaleString()}
            </span>
            <span className="ml-1.5 text-xs font-medium uppercase tracking-wide">
              human rated
            </span>
          </p>
          <span
            className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            title="Unlocked feed is always in admin mode"
          >
            Admin
          </span>
        </div>
      </header>

      {/* Tab navigation */}
      <FeedNav
        activeId="main"
        feedHref={buildFeedUrl({
          topicId: topicId!,
          admin: true,
          source,
          secret: feedSecret,
        })}
      />

      <p
        className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
        aria-label="Last ingest summary"
      >
        Last ingest{" "}
        <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
          {lastIngestLabel}
        </span>
        {" · "}
        <span className="tabular-nums">{ingestStats.ingestedCount}</span> new
        {" · "}
        <span className="tabular-nums">{ingestStats.summarizedCount}</span> newly
        summarized
        {" · "}
        <span className="tabular-nums">{ingestStats.mlPriorityGe5Count}</span> ML ≥ 5
      </p>

      <div className="mt-6">
        <NewsApprovalQueue secret={feedSecret} />
      </div>

      {/* Filter toolbar */}
      <section
        className="mt-4 mb-5 rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60"
        aria-label="Filters and sort"
      >
        <form method="GET" action={BASE_PATH}>
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="source" value="pubmed" />
          <input type="hidden" name="secret" value={feedSecret} />
          <input type="hidden" name="admin" value="1" />

          <div className="flex flex-wrap items-end gap-5">
            {/* Sort */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Sort</span>
              {(
                [
                  { value: "ingested" as const, label: "Ingested" },
                  { value: "published" as const, label: "Published" },
                  { value: "relevance" as const, label: "Relevance" },
                ] as const
              ).map((opt, i) => (
                <span key={opt.value} className="inline-flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                      |
                    </span>
                  )}
                  <a
                    href={buildFeedUrl({
                      topicId,
                      sort: opt.value,
                      keyword,
                      page: 1,
                      minRelevance,
                      minPriority,
                      setting: setting || undefined,
                      unratedOnly,
                      admin: isAdmin || undefined,
                      source,
                      secret: feedSecret,
                    })}
                    className={
                      sort === opt.value
                        ? "font-semibold text-zinc-900 dark:text-zinc-100"
                        : "hover:text-zinc-900 dark:hover:text-zinc-100"
                    }
                  >
                    {opt.label}
                  </a>
                </span>
              ))}
            </div>

            {/* Keyword / journal / PMID */}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>Search</span>
              <input
                type="text"
                name="keyword"
                defaultValue={keyword}
                placeholder="Keyword, journal, or PMID…"
                className="w-56 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </label>

            {/* Setting */}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>Setting</span>
              <select
                name="setting"
                defaultValue={setting}
                className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All settings</option>
                {ARTICLE_SETTING_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {ARTICLE_SETTING_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            {/* Min priority */}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>Min priority</span>
              <select
                name="minPriority"
                defaultValue={minPriority > 0 ? String(minPriority) : ""}
                className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">Any</option>
                {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    ≥ {n}
                  </option>
                ))}
              </select>
            </label>

            {/* Human-unrated only */}
            <label className="flex cursor-pointer items-center gap-2 self-end pb-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                name="unrated"
                value="1"
                defaultChecked={unratedOnly}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-800 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span>Unrated only</span>
            </label>

            {/* Min relevance — admin only */}
            {isAdmin && (
              <Suspense fallback={null}>
                <RelevanceSlider defaultValue={minRelevance} />
              </Suspense>
            )}

            {isAdmin && (
              <a
                href="/stewardshipbrief/settings"
                className="self-center text-xs font-medium text-[#2A79A7] underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Brief ranking settings →
              </a>
            )}

            <input type="hidden" name="sort" value={sort} />

            <button
              type="submit"
              className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            >
              Apply
            </button>

            {hasFilters && (
              <a
                href={buildFeedUrl({
                  topicId,
                  sort,
                  admin: isAdmin || undefined,
                  source,
                  secret: feedSecret,
                })}
                className="self-center text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Clear filters
              </a>
            )}
          </div>

        </form>
      </section>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main feed */}
        <main className="min-w-0 flex-1 lg:max-w-[720px]">
          {list.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-12 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400">
              No PubMed summaries found for this topic.{" "}
              {hasFilters && (
                <>
                  {" "}
                  <a
                    href={buildFeedUrl({
                      topicId,
                      sort,
                      admin: isAdmin || undefined,
                      source,
                      secret: feedSecret,
                    })}
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Clear filters
                  </a>
                </>
              )}
            </p>
          ) : (
            <>
              <ul className="space-y-4">
                {list.map((item) => (
                  <li key={item.pmid}>
                    <ArticleCard
                      item={item}
                      query_string={query_string}
                      topicId={topicId!}
                      sort={sort}
                      keyword={keyword}
                      minRelevance={minRelevance}
                      minPriority={minPriority}
                      setting={setting}
                      unratedOnly={unratedOnly}
                      isAdmin={isAdmin}
                      weights={weights}
                      scoringOptions={scoringOptions}
                      source={source}
                      priorityModel={priorityModel}
                      embedding={embeddingByPmid.get(item.pmid) ?? null}
                      secret={feedSecret}
                    />
                  </li>
                ))}
              </ul>

              <nav
                className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700"
                aria-label="Pagination"
              >
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {totalPages > 1 ? (
                    <>
                      Page {currentPage} of {totalPages}
                      <span className="ml-2 text-zinc-400">
                        ({totalCount} summaries)
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-400">{totalCount} summaries</span>
                  )}
                </span>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    {currentPage > 1 ? (
                      <a
                        href={buildFeedUrl({
                          topicId,
                          sort,
                          keyword,
                          page: currentPage - 1,
                          minRelevance,
                          minPriority,
                          setting: setting || undefined,
                          unratedOnly,
                          admin: isAdmin || undefined,
                          source,
                          secret: feedSecret,
                        })}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        ← Previous
                      </a>
                    ) : (
                      <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-300 dark:border-zinc-700 dark:text-zinc-600">
                        ← Previous
                      </span>
                    )}
                    {currentPage < totalPages ? (
                      <a
                        href={buildFeedUrl({
                          topicId,
                          sort,
                          keyword,
                          page: currentPage + 1,
                          minRelevance,
                          minPriority,
                          setting: setting || undefined,
                          unratedOnly,
                          admin: isAdmin || undefined,
                          source,
                          secret: feedSecret,
                        })}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        Next →
                      </a>
                    ) : (
                      <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-300 dark:border-zinc-700 dark:text-zinc-600">
                        Next →
                      </span>
                    )}
                  </div>
                )}
              </nav>
            </>
          )}
        </main>

        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-52">
          <div className="sticky top-4">
            <div className="rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Trending
              </h3>
              <p className="mt-0.5 mb-3 text-xs text-zinc-400 dark:text-zinc-600">
                Last 30 days
              </p>
              {trendingKeywords.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">No data yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {trendingKeywords.map(({ keyword: kw }) => (
                    <a
                      key={kw}
                      href={buildFeedUrl({
                        topicId,
                        sort,
                        keyword: kw,
                        page: 1,
                        minRelevance,
                        minPriority,
                        setting: setting || undefined,
                        unratedOnly,
                        admin: isAdmin || undefined,
                        source,
                        secret: feedSecret,
                      })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium leading-none transition hover:opacity-90 ${keywordColorClasses(kw)}`}
                    >
                      {kw}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
