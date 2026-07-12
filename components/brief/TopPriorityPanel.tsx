"use client";

import type { TopPriorityItem } from "@/lib/brief/topPriority";
import { brief } from "@/components/brief/briefTheme";

export default function TopPriorityPanel({
  items,
}: {
  items: TopPriorityItem[];
}) {
  return (
    <section aria-labelledby="top10-heading">
      <h2
        id="top10-heading"
        className={`${brief.kicker} mb-1 pb-2 border-b ${brief.hairline}`}
      >
        Top 10 · past year
      </h2>
      <p className={`${brief.sans} text-xs ${brief.muted} mb-4`}>
        Highest priority rankings
      </p>
      {items.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          No high-priority studies in the past 12 months yet.
        </p>
      ) : (
        <ol className="space-y-3.5">
          {items.map((item, i) => (
            <li key={item.pmid} className={`${brief.sans} text-sm`}>
              <a
                href={item.pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex gap-2.5 ${brief.ink} ${brief.accentHover}`}
              >
                <span
                  className={`${brief.muted} tabular-nums shrink-0 w-5 pt-0.5`}
                >
                  {i + 1}.
                </span>
                <span className="min-w-0">
                  <span className={`${brief.serif} text-[0.9375rem] leading-snug font-semibold group-hover:text-[#2A79A7] transition-colors line-clamp-3`}>
                    {item.headline}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
