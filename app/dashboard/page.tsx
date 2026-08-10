import Link from "next/link";
import {
  getDashboardData,
  type RatingBucket,
  type SettingBucket,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

function buildDashboardUrl(params: {
  from: string;
  to: string;
  source?: string;
}): string {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.source && params.source !== "all") q.set("source", params.source);
  return `/dashboard?${q}`;
}

function BarRow({
  label,
  count,
  max,
  tone = "amber",
  labelWidth = "4.5rem",
}: {
  label: string;
  count: number;
  max: number;
  tone?: "amber" | "sky" | "zinc" | "violet";
  labelWidth?: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const fill =
    tone === "sky"
      ? "bg-sky-500 dark:bg-sky-400"
      : tone === "zinc"
        ? "bg-zinc-400 dark:bg-zinc-500"
        : tone === "violet"
          ? "bg-violet-500 dark:bg-violet-400"
          : "bg-amber-500 dark:bg-amber-400";
  return (
    <div
      className="grid items-center gap-2 text-sm"
      style={{ gridTemplateColumns: `${labelWidth} 1fr 2.5rem` }}
    >
      <span
        className="truncate text-zinc-600 dark:text-zinc-400"
        title={label}
      >
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
        {count}
      </span>
    </div>
  );
}

/** Side-by-side human (amber) and ML (violet) bars for one priority score. */
function DualRatingRow({
  bucket,
  max,
}: {
  bucket: RatingBucket;
  max: number;
}) {
  const humanPct = max > 0 ? (bucket.human / max) * 100 : 0;
  const mlPct = max > 0 ? (bucket.ml / max) * 100 : 0;
  return (
    <div className="grid grid-cols-[2rem_1fr_1fr_4.5rem] items-center gap-2 text-sm">
      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
        {bucket.rating}
      </span>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        title={`Human: ${bucket.human}`}
      >
        <div
          className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
          style={{ width: `${humanPct}%` }}
        />
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        title={`ML: ${bucket.ml}`}
      >
        <div
          className="h-full rounded-full bg-violet-500 dark:bg-violet-400"
          style={{ width: `${mlPct}%` }}
        />
      </div>
      <span className="text-right text-xs tabular-nums text-zinc-500">
        <span className="font-medium text-amber-700 dark:text-amber-300">
          {bucket.human}
        </span>
        <span className="text-zinc-300 dark:text-zinc-600"> / </span>
        <span className="font-medium text-violet-700 dark:text-violet-300">
          {bucket.ml}
        </span>
      </span>
    </div>
  );
}

function formatAvg(v: number, kind: "binary" | "continuous"): string {
  if (kind === "binary") return `${(v * 100).toFixed(1)}%`;
  return v >= 10 ? v.toFixed(1) : v.toFixed(3);
}

function formatEasternDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; source?: string }>;
}) {
  const params = await searchParams;
  const data = await getDashboardData({
    from: params.from,
    to: params.to,
    source: params.source,
  });
  const maxRating = Math.max(
    1,
    ...data.ratingHistogram.map((b) => Math.max(b.human, b.ml))
  );
  const maxSetting = Math.max(1, ...data.settingBreakdown.map((b) => b.count));
  const maxKeyword = Math.max(1, ...data.topKeywords.map((b) => b.count), 1);
  const maxMesh = Math.max(1, ...data.topMeshTerms.map((b) => b.count), 1);
  const ingest = data.ingest;

  return (
    <div className="mx-auto min-h-screen max-w-[1100px] px-4 py-6 font-sans text-zinc-900 dark:text-zinc-100">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Full feed
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Corpus stats for the PubMed stewardship feed.
          </p>
        </div>
        <Link
          href="/feed"
          className="text-sm font-medium text-[#2A79A7] hover:underline"
        >
          ← Back to feed
        </Link>
      </header>

      {/* Last / next ingest */}
      <section
        className="mb-6 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60"
        aria-label="Ingest status"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Last PubMed ingest
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
              {formatEasternDateTime(ingest.lastAt)}
            </p>
            <p className="mt-0.5 text-[0.65rem] text-zinc-400">
              Times in Eastern (America/New_York)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <span
                title="Articles first seen in this ingest run (not refreshes)"
              >
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {ingest.ingestedCount.toLocaleString()}
                </span>{" "}
                new
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
                title="Summaries written in this ingest run"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
                {ingest.summarizedCount.toLocaleString()} newly summarized
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span
                className="text-sm text-zinc-600 dark:text-zinc-300"
                title="New summaries with stored ml_priority ≥ 5"
              >
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {ingest.mlPriorityGe5Count.toLocaleString()}
                </span>{" "}
                ML ≥ 5
              </span>
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            Next ingest{" "}
            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
              {formatEasternDateTime(ingest.nextAt)}
            </span>
          </p>
        </div>
      </section>

      {/* Date range */}
      <section
        className="mb-6 rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60"
        aria-label="Date range"
      >
        <form method="GET" action="/dashboard" className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>Start date</span>
            <input
              type="date"
              name="from"
              defaultValue={data.range.from}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>End date</span>
            <input
              type="date"
              name="to"
              defaultValue={data.range.to}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Apply
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-400">
          Filters use article release/pub date. Charts below use{" "}
          <span className="tabular-nums">{data.range.from}</span>
          {" → "}
          <span className="tabular-nums">{data.range.to}</span>
          {" · "}
          {data.inRangeCount.toLocaleString()} studies in range.
        </p>
      </section>

      {/* Counts — all scoped to the selected article-date range */}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            In database
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {data.totalInDatabase.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Articles with release/pub date in range
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            On the feed
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {data.totalOnFeed.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Stewardship feed PMIDs in range
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Ratings in range
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {data.humanRatedCount.toLocaleString()}
            <span className="text-lg font-semibold text-zinc-400"> / </span>
            <span className="text-violet-700 dark:text-violet-300">
              {data.mlPredictedCount.toLocaleString()}
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">Human rated · ML-only</p>
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Rating histogram */}
        <section className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Priority ratings
          </h2>
          <p className="mb-2 text-xs text-zinc-500">
            Score 1–10 · human ratings beside ML predictions for every article
            in range. Empty ML buckets mean the model rarely rounds to that
            integer (predictions are continuous, then rounded).
          </p>
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Human ({data.humanRatedCount.toLocaleString()})
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              ML ({data.inRangeCount.toLocaleString()} — includes human-rated)
            </span>
          </div>
          <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_4.5rem] gap-2 text-[0.65rem] uppercase tracking-wide text-zinc-400">
            <span />
            <span>Human</span>
            <span>ML</span>
            <span className="text-right">n / n</span>
          </div>
          <div className="space-y-1.5">
            {data.ratingHistogram.map((b) => (
              <DualRatingRow key={b.rating} bucket={b} max={maxRating} />
            ))}
          </div>
          <p className="mt-2 text-right text-[0.65rem] text-zinc-400">
            counts: human / ML · ML covers all articles in range
          </p>
        </section>

        {/* Setting breakdown */}
        <section className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Study settings
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Admin override when set, otherwise auto-classification
          </p>
          <div className="space-y-1.5">
            {data.settingBreakdown.map((b: SettingBucket) => (
              <BarRow
                key={b.setting}
                label={b.label}
                count={b.count}
                max={maxSetting}
                tone="sky"
                labelWidth="7.5rem"
              />
            ))}
          </div>
        </section>
      </div>

      {/* Keywords — single column, top to bottom */}
      <section className="mb-6 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Top keywords
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Most frequent article keywords in range (top 25, highest first)
        </p>
        {data.topKeywords.length === 0 ? (
          <p className="text-sm text-zinc-400">No keywords in this range.</p>
        ) : (
          <div className="max-w-xl space-y-1.5">
            {data.topKeywords.map((kw) => (
              <BarRow
                key={kw.keyword}
                label={kw.keyword}
                count={kw.count}
                max={maxKeyword}
                tone="sky"
                labelWidth="11rem"
              />
            ))}
          </div>
        )}
      </section>

      {/* MeSH terms — single column, top to bottom */}
      <section className="mb-6 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Top MeSH terms
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Most frequent Medical Subject Headings in range (top 25, highest first)
        </p>
        {data.topMeshTerms.length === 0 ? (
          <p className="text-sm text-zinc-400">No MeSH terms in this range.</p>
        ) : (
          <div className="max-w-xl space-y-1.5">
            {data.topMeshTerms.map((term) => (
              <BarRow
                key={term.keyword}
                label={term.keyword}
                count={term.count}
                max={maxMesh}
                tone="violet"
                labelWidth="14rem"
              />
            ))}
          </div>
        )}
      </section>

      {/* ML model features */}
      <section className="mb-6 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Priority model features
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          The eight inputs to the ridge priority model
          {data.modelSampleCount != null
            ? ` · trained on ${data.modelSampleCount.toLocaleString()} ratings`
            : " · using calibrated fallback (no stored model)"}
          {" · "}
          counts and averages over the selected date range
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                <th className="py-2 pr-3 font-medium">Feature</th>
                <th className="py-2 pr-3 text-right font-medium">Count</th>
                <th className="py-2 pr-3 text-right font-medium">Share / avg</th>
                <th className="py-2 text-right font-medium">Model weight</th>
              </tr>
            </thead>
            <tbody>
              {data.modelFeatures.map((f) => (
                <tr
                  key={f.name}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 pr-3">
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">
                      {f.label}
                    </span>
                    <span className="ml-2 font-mono text-[0.65rem] text-zinc-400">
                      {f.name}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {f.count.toLocaleString()}
                    <span className="text-zinc-400">
                      /{data.inRangeCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {formatAvg(f.average, f.kind)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums font-medium ${
                      f.weight == null
                        ? "text-zinc-400"
                        : f.weight > 0
                          ? "text-green-700 dark:text-green-400"
                          : f.weight < 0
                            ? "text-red-700 dark:text-red-400"
                            : "text-zinc-500"
                    }`}
                  >
                    {f.weight == null
                      ? "—"
                      : `${f.weight >= 0 ? "+" : ""}${f.weight.toFixed(3)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Count = articles with feature &gt; 0. For binary flags, share is the
          mean (percent present). Weight is the learned ridge coefficient on
          standardized units.
        </p>
      </section>

      {/* Top 10 */}
      <section className="mb-6 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Top 10 by priority
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Same rules as the homepage Top 10: priority ≥ 5 · human over ML ·
          relevance · journal impact · article date in range
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">Article</th>
                <th className="py-2 pr-2 text-right font-medium">Priority</th>
                <th className="py-2 pr-2 text-right font-medium">Score</th>
                <th className="py-2 font-medium">Setting</th>
              </tr>
            </thead>
            <tbody>
              {data.topTen.map((item, i) => (
                <tr
                  key={item.pmid}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2.5 pr-2 tabular-nums text-zinc-400">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-900 hover:text-[#2A79A7] dark:text-zinc-100"
                    >
                      {item.title}
                    </a>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      <Link
                        href={`/feed?keyword=${encodeURIComponent(item.pmid)}`}
                        className="hover:underline"
                      >
                        {item.pmid}
                      </Link>
                      {item.date ? ` · ${item.date}` : ""}
                      {item.adminPriority != null ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          · rated
                        </span>
                      ) : (
                        <span className="text-violet-600 dark:text-violet-400">
                          {" "}
                          · predicted
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`py-2.5 pr-2 text-right tabular-nums font-semibold ${
                      item.adminPriority != null
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-violet-700 dark:text-violet-300"
                    }`}
                  >
                    {item.effectivePriority}
                    <span className="font-normal text-zinc-400">/10</span>
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {item.relevancePercent}
                    <span className="text-zinc-400">/100</span>
                  </td>
                  <td className="py-2.5 text-zinc-500">{item.setting}</td>
                </tr>
              ))}
              {data.topTen.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-400">
                    No studies in this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Schema */}
      <section className="mb-10 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Supabase fields
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Collapsible inventory of tables and columns used by the app
        </p>
        <div className="space-y-2">
          {data.schema.map((table) => (
            <details
              key={table.table}
              className="group rounded-lg border border-zinc-200/70 dark:border-zinc-700/50"
            >
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-zinc-700 marker:content-none dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block text-zinc-400 transition group-open:rotate-90">
                  ▸
                </span>
                <span className="font-mono text-[0.85rem]">{table.table}</span>
                <span className="ml-2 font-normal text-zinc-400">
                  — {table.description}
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-zinc-400">
                      <th className="py-1 pr-3 font-medium">Field</th>
                      <th className="py-1 pr-3 font-medium">Type</th>
                      <th className="py-1 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.fields.map((f) => (
                      <tr
                        key={f.name}
                        className="border-t border-zinc-50 dark:border-zinc-800/80"
                      >
                        <td className="py-1 pr-3 font-mono text-zinc-700 dark:text-zinc-300">
                          {f.name}
                        </td>
                        <td className="py-1 pr-3 text-zinc-500">{f.type}</td>
                        <td className="py-1 text-zinc-400">{f.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
