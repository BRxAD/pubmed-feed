"use client";

import type { TopCitedItem } from "@/lib/brief/topCited";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";

export default function TopCitedPanel({
  items,
  filtered = false,
}: {
  items: TopCitedItem[];
  filtered?: boolean;
}) {
  return (
    <section aria-labelledby="top-cited-heading">
      <SidebarHeading id="top-cited-heading">
        Top 10 · most cited
      </SidebarHeading>
      <p className={`${brief.sans} -mt-2 mb-4 text-[0.75rem] leading-snug ${brief.muted}`}>
        Citations per month · past 12 months
      </p>
      {items.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          {filtered
            ? "No cited studies in this filter yet."
            : "Citation counts are still being collected."}
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
                  <span
                    className={`${brief.serif} text-[0.9375rem] leading-snug font-semibold group-hover:text-[#2A79A7] transition-colors`}
                  >
                    {item.headline}
                  </span>
                  <span className={`mt-0.5 block text-[0.75rem] ${brief.muted}`}>
                    {item.citedByCount === 1
                      ? "1 citation"
                      : `${item.citedByCount} citations`}
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
