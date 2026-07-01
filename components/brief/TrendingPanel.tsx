"use client";

import type { TrendingTerm } from "@/lib/brief/trending";
import { brief } from "@/components/brief/briefTheme";

export default function TrendingPanel({ terms }: { terms: TrendingTerm[] }) {
  return (
    <section aria-labelledby="trending-heading">
      <h2
        id="trending-heading"
        className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}
      >
        Trending
      </h2>
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
              >
                <span>
                  <span className={`${brief.muted} mr-2 tabular-nums`}>{i + 1}.</span>
                  {t.keyword}
                </span>
                <span className={`${brief.accent} tabular-nums text-xs shrink-0`}>
                  {t.deltaPercent > 0 ? "+" : ""}
                  {t.deltaPercent}%
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
