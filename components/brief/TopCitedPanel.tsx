"use client";

import type { TopCitedItem } from "@/lib/brief/topCited";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import { TopTenList } from "@/components/brief/TopTenActions";

export default function TopCitedPanel({
  items,
  filtered = false,
  saved,
  onToggleSave,
}: {
  items: TopCitedItem[];
  filtered?: boolean;
  saved: Set<string>;
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
}) {
  return (
    <section aria-labelledby="top-cited-heading">
      <div className="mb-1 flex items-center gap-2">
        <RankFlame />
        <SidebarHeading id="top-cited-heading" className="mb-0">
          Top 10 · most cited
        </SidebarHeading>
      </div>
      <p className={`${brief.sans} mb-4 text-[0.75rem] leading-snug ${brief.muted}`}>
        Citations per month · past 12 months
      </p>
      {items.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          {filtered
            ? "No cited studies in this filter yet."
            : "Citation counts are still being collected."}
        </p>
      ) : (
        <TopTenList
          items={items}
          saved={saved}
          onToggleSave={onToggleSave}
          note={(item) =>
            item.citedByCount === 1
              ? "1 citation"
              : `${item.citedByCount} citations`
          }
        />
      )}
    </section>
  );
}

function RankFlame() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-[#C4544A]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
