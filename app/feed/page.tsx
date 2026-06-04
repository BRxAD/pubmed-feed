import { Suspense } from "react";
import {
  getFeedItems,
  getDefaultTopicId,
  getTrendingKeywords,
  type FeedItem,
  type FeedSort,
} from "@/lib/feed";
import {
  computeBreakdown,
  parseWeightsFromParams,
  weightsToParams,
  DEFAULT_WEIGHTS,
  type RankingWeights,
} from "@/lib/ranking";
import {
  normalizeScoreTo100,
  formatStudyLabel,
  keywordColorClasses,
  studyAccentClass,
  parseSummaryBullets,
  getItemSetting,
  type ArticleSetting,
} from "@/lib/filters";
import { lookupJif, isHighImpactJournal } from "@/lib/jif";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import AdminToggle from "@/components/AdminToggle";
import FeedNav from "@/components/FeedNav";
import RelevanceSlider from "@/components/RelevanceSlider";
import RelevanceWeightsPanel from "@/components/RelevanceWeightsPanel";
import AdminPrioritySelector from "@/components/AdminPrioritySelector";
import SourceSelector from "@/components/SourceSelector";
import { snapshotFromBreakdown } from "@/lib/relevanceLearning";
import {
  articleExternalUrl,
  parseFeedSource,
  type FeedSource,
} from "@/lib/feedSource";

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
  weights?: RankingWeights;
  source?: FeedSource;
}): string {
  const q = new URLSearchParams();
  q.set("topicId", params.topicId);
  if (params.source && params.source !== "pubmed") q.set("source", params.source);
  if (params.sort) q.set("sort", params.sort);
  if (params.keyword?.trim()) q.set("keyword", params.keyword.trim());
  if (params.page != null && params.page > 1) q.set("page", String(params.page));
  if (params.minRelevance && params.minRelevance > 0)
    q.set("minRelevance", String(params.minRelevance));
  if (params.setting) q.set("setting", params.setting);
  if (params.admin) q.set("admin", "1");
  if (params.weights) {
    for (const [k, v] of Object.entries(weightsToParams(params.weights)))
      q.set(k, v);
  }
  return `${BASE_PATH}?${q.toString()}`;
}

const SETTING_LABELS: Record<ArticleSetting, string> = {
  hospital: "Hospital",
  community: "Community",
  "long-term care": "Long-term care",
  animal: "Animal / Vet",
  environment: "Environment",
};

const SETTING_BADGE_CLASSES: Record<ArticleSetting, string> = {
  hospital: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  community: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "long-term care": "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
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
    meshTerms: [],
    keywords: item.articles?.keywords ?? [],
    authors: [],
  };
}

function getItemScore(
  item: FeedItem,
  query_string: string,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  const jifIsHigh = isHighImpactJournal(item.articles?.journal);
  const bd = computeBreakdown(query_string, makeRec(item), weights, true, jifIsHigh);
  return item.rank_score != null && !Number.isNaN(Number(item.rank_score))
    ? Number(item.rank_score)
    : bd.finalScore;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({
  item,
  query_string,
  topicId,
  sort,
  keyword,
  minRelevance,
  setting,
  isAdmin,
  weights,
  source,
}: {
  item: FeedItem;
  query_string: string;
  topicId: string;
  sort: FeedSort;
  keyword: string;
  minRelevance: number;
  setting: ArticleSetting | "";
  isAdmin: boolean;
  weights: RankingWeights;
  source: FeedSource;
}) {
  const journal = item.articles?.journal != null ? String(item.articles.journal) : "";
  const dateStr = formatDate(
    item.articles?.release_date ?? item.articles?.pub_date ?? item.articles?.fetched_at
  );
  const articleUrl = articleExternalUrl(item.pmid, item.source ?? source);

  const jifEntry = lookupJif(item.articles?.journal);
  const jifIsHigh = jifEntry != null && isHighImpactJournal(item.articles?.journal);
  const breakdown = computeBreakdown(query_string, makeRec(item), weights, true, jifIsHigh);
  const score = item.rank_score != null && !Number.isNaN(Number(item.rank_score))
    ? Number(item.rank_score)
    : breakdown.finalScore;
  const normalizedScore = normalizeScoreTo100(score);

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
  const itemSetting = getItemSetting(item);

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
        {dateStr && (
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
        {itemSetting && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SETTING_BADGE_CLASSES[itemSetting]}`}
          >
            {SETTING_LABELS[itemSetting]}
          </span>
        )}
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
                  admin: isAdmin || undefined,
                  source,
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
              Admin · Relevance
            </p>
            <div
              className="h-1.5 w-20 rounded-full bg-zinc-200 dark:bg-zinc-600"
              role="presentation"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                style={{ width: `${normalizedScore}%` }}
              />
            </div>
            <span className="tabular-nums font-semibold text-amber-700 dark:text-amber-400">
              {normalizedScore}/100
            </span>
          </div>

          {/* Score breakdown */}
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500 dark:text-zinc-400">
            {breakdown.stewardshipTitle > 0 && (
              <span>Title stewardship: <strong className="text-zinc-700 dark:text-zinc-300">+{breakdown.stewardshipTitle}</strong></span>
            )}
            {breakdown.stewardshipAbstract > 0 && (
              <span>Abstract: <strong className="text-zinc-700 dark:text-zinc-300">+{breakdown.stewardshipAbstract}</strong></span>
            )}
            {breakdown.largeStudy > 0 && (
              <span>Large study: <strong className="text-zinc-700 dark:text-zinc-300">+{breakdown.largeStudy}</strong></span>
            )}
            {breakdown.extraTerms > 0 && (
              <span>Extra terms: <strong className="text-zinc-700 dark:text-zinc-300">+{breakdown.extraTerms}</strong></span>
            )}
            {breakdown.studyBoostFactor > 1 && (
              <span>Study boost: <strong className="text-zinc-700 dark:text-zinc-300">×{breakdown.studyBoostFactor.toFixed(2)}</strong></span>
            )}
            {breakdown.jifBoostFactor > 1 && (
              <span>JIF ×1.2: <strong className="text-green-700 dark:text-green-400">applied</strong></span>
            )}
            <span className="ml-1 text-zinc-400">→ raw {Math.round(breakdown.finalScore * 10) / 10}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-zinc-500 dark:text-zinc-400">
            <span>
              Impact factor:{" "}
              <strong className={jifStr ? (jifIsHigh ? "text-green-700 dark:text-green-400" : "text-zinc-700 dark:text-zinc-300") : "text-zinc-400"}>
                {jifStr ? `${jifStr}${jifIsHigh ? " ★" : ""}` : "—"}
              </strong>
            </span>
            <span>
              {item.source === "openalex" ? "Work ID" : "PMID"}:{" "}
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
                Admin priority:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {item.admin_priority}/10
                </strong>
              </span>
            )}
          </div>

          <AdminPrioritySelector
            topicId={topicId}
            pmid={item.pmid}
            initialPriority={item.admin_priority}
            featureSnapshot={snapshotFromBreakdown(breakdown)}
          />
        </div>
      )}
    </article>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const VALID_SETTINGS = new Set<ArticleSetting>([
  "hospital", "community", "long-term care", "animal", "environment",
]);

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
    setting?: string;
    admin?: string;
    wTitle?: string;
    wAbstract?: string;
    wLarge?: string;
    studyBoost?: string;
    jifBoost?: string;
    source?: string;
  }>;
}) {
  const {
    topicId: topicIdRaw,
    source: sourceRaw,
    sort: sortRaw,
    keyword: keywordRaw,
    page: pageRaw,
    minRelevance: minRelevanceRaw,
    setting: settingRaw,
    admin: adminRaw,
    wTitle,
    wAbstract,
    wLarge,
    studyBoost,
    jifBoost,
  } = await searchParams;

  const source = parseFeedSource(sourceRaw);
  let topicId = topicIdRaw?.trim();
  const sort: FeedSort =
    sortRaw === "relevance" || sortRaw === "recency" ? sortRaw : "recency";
  const keyword = keywordRaw?.trim() ?? "";
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const isAdmin = adminRaw === "1";
  // Min relevance filter is only available in admin mode
  const minRelevance = isAdmin
    ? Math.max(0, Math.min(100, parseFloat(minRelevanceRaw ?? "0") || 0))
    : 0;
  const setting = parseSettingParam(settingRaw);
  const weights = isAdmin
    ? parseWeightsFromParams({ wTitle, wAbstract, wLarge, studyBoost, jifBoost })
    : DEFAULT_WEIGHTS;

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

  const filters = { keyword: keyword || undefined };

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

  const { items, query_string, totalCount, totalPages, page: currentPage } = result;
  const trendingKeywords = await getTrendingKeywords(topicId, source);

  let list = items.filter((item) => item.pmid);
  if (minRelevance > 0) {
    list = list.filter((item) => {
      const score = getItemScore(item, query_string, weights);
      return normalizeScoreTo100(score) >= minRelevance;
    });
  }
  if (setting) {
    list = list.filter((item) => getItemSetting(item) === setting);
  }

  const hasFilters = keyword !== "" || minRelevance > 0 || setting !== "";

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      {/* Header: logo + admin toggle */}
      <header className="mb-4 flex items-start justify-between gap-4">
        {/* Logo — plain <a> so clicking always triggers a full reload */}
        <a href="/feed" className="inline-block shrink-0">
          <img
            src="/logo-steward-feed.png?v=2"
            alt="StewardFeed"
            width={1080}
            height={288}
            className="h-[60px] w-auto max-w-full object-contain object-left dark:invert-0"
            style={{ background: "transparent" }}
          />
        </a>
        <Suspense fallback={null}>
          <AdminToggle isAdmin={isAdmin} basePath={BASE_PATH} />
        </Suspense>
      </header>

      {/* Tab navigation */}
      <FeedNav activeId="main" />

      {/* Filter toolbar */}
      <section
        className="mt-4 mb-5 rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60"
        aria-label="Filters and sort"
      >
        <form method="GET" action={BASE_PATH}>
          <input type="hidden" name="topicId" value={topicId} />
          {source !== "pubmed" && (
            <input type="hidden" name="source" value={source} />
          )}
          {isAdmin && <input type="hidden" name="admin" value="1" />}

          <div className="flex flex-wrap items-end gap-5">
            <Suspense fallback={null}>
              <SourceSelector source={source} basePath={BASE_PATH} />
            </Suspense>

            {/* Sort */}
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Sort</span>
              <a
                href={buildFeedUrl({ topicId, sort: "relevance", keyword, page: 1, minRelevance, setting: setting || undefined, admin: isAdmin || undefined, source })}
                className={
                  sort === "relevance"
                    ? "font-semibold text-zinc-900 dark:text-zinc-100"
                    : "hover:text-zinc-900 dark:hover:text-zinc-100"
                }
              >
                Relevance
              </a>
              <span aria-hidden className="text-zinc-300 dark:text-zinc-600">|</span>
              <a
                href={buildFeedUrl({ topicId, sort: "recency", keyword, page: 1, minRelevance, setting: setting || undefined, admin: isAdmin || undefined, source })}
                className={
                  sort === "recency"
                    ? "font-semibold text-zinc-900 dark:text-zinc-100"
                    : "hover:text-zinc-900 dark:hover:text-zinc-100"
                }
              >
                Recency
              </a>
            </div>

            {/* Keyword */}
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <span>Keyword</span>
              <input
                type="text"
                name="keyword"
                defaultValue={keyword}
                placeholder="Filter by keyword…"
                className="w-44 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
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
                <option value="hospital">Hospital</option>
                <option value="community">Community</option>
                <option value="long-term care">Long-term care</option>
                <option value="animal">Animal / Veterinary</option>
                <option value="environment">Environment</option>
              </select>
            </label>

            {/* Min relevance — admin only */}
            {isAdmin && (
              <Suspense fallback={null}>
                <RelevanceSlider defaultValue={minRelevance} />
              </Suspense>
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
                href={buildFeedUrl({ topicId, sort, admin: isAdmin || undefined, source })}
                className="self-center text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Clear filters
              </a>
            )}
          </div>

          {/* Relevance weights editor — admin only */}
          {isAdmin && (
            <Suspense fallback={null}>
              <RelevanceWeightsPanel
                weights={weights}
                basePath={BASE_PATH}
                preservedParams={{
                  topicId: topicId!,
                  sort,
                  ...(source !== "pubmed" ? { source } : {}),
                  ...(keyword ? { keyword } : {}),
                  ...(setting ? { setting } : {}),
                  ...(minRelevance > 0 ? { minRelevance: String(minRelevance) } : {}),
                  admin: "1",
                }}
              />
            </Suspense>
          )}
        </form>
      </section>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Main feed */}
        <main className="min-w-0 flex-1 lg:max-w-[720px]">
          {list.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-12 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400">
              No {source === "openalex" ? "OpenAlex" : "PubMed"} articles found for this topic.
              {source === "openalex" && (
                <>
                  {" "}
                  Run OpenAlex ingest first (see docs/OPENALEX_SETUP.md).
                </>
              )}
              {hasFilters && (
                <>
                  {" "}
                  <a
                    href={buildFeedUrl({ topicId, sort, admin: isAdmin || undefined, source })}
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
                      setting={setting}
                      isAdmin={isAdmin}
                      weights={weights}
                      source={source}
                    />
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <nav
                  className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700"
                  aria-label="Pagination"
                >
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Page {currentPage} of {totalPages}
                    <span className="ml-2 text-zinc-400">({totalCount} articles)</span>
                  </span>
                  <div className="flex gap-2">
                    {currentPage > 1 ? (
                      <a
                        href={buildFeedUrl({ topicId, sort, keyword, page: currentPage - 1, minRelevance, setting: setting || undefined, admin: isAdmin || undefined, source })}
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
                        href={buildFeedUrl({ topicId, sort, keyword, page: currentPage + 1, minRelevance, setting: setting || undefined, admin: isAdmin || undefined, source })}
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
                </nav>
              )}
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
                        admin: isAdmin || undefined,
                        source,
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
