"use client";

import type { TrendingTerm } from "@/lib/brief/trending";
import { brief } from "@/components/brief/briefTheme";

function formatTrendDelta(term: TrendingTerm): string {
  if (term.isNew) {
    return term.count === 1 ? "new" : `+${term.count} new`;
  }
  if (term.deltaPercent == null) return "";
  const sign = term.deltaPercent > 0 ? "+" : "";
  return `${sign}${term.deltaPercent}%`;
}

export default function TrendingPanel({ terms }: { terms: TrendingTerm[] }) {
  return (
    <section aria-labelledby="trending-heading">
      <h2
        id="trending-heading"
        className={`${brief.kicker} mb-1 pb-2 border-b ${brief.hairline}`}
      >
        Trending
      </h2>
      <p className={`${brief.sans} text-xs ${brief.muted} mb-4`}>
        Last 30 days vs prior 30 days
      </p>
      {terms.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          Not enough keyword history yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {terms.map((t, i) => (
            <li key={t.keyword} className={`${brief.sans} text-sm`}>
              <a
                href={`/feed?source=pubmed&keyword=${encodeURIComponent(t.keyword)}`}
                className={`flex items-baseline justify-between gap-2 ${brief.ink} ${brief.accentHover}`}
                title={`${t.count} mentions (last 30d) · ${t.priorCount} (prior 30d)`}
              >
                <span>
                  <span className={`${brief.muted} mr-2 tabular-nums`}>{i + 1}.</span>
                  {t.keyword}
                </span>
                <span className={`${brief.accent} tabular-nums text-xs shrink-0`}>
                  {formatTrendDelta(t)}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
