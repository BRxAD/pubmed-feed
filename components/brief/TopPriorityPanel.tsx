"use client";

import type { TopPriorityItem } from "@/lib/brief/topPriority";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import { TopTenList } from "@/components/brief/TopTenActions";

export default function TopPriorityPanel({
  items,
  saved,
  onToggleSave,
}: {
  items: TopPriorityItem[];
  saved: Set<string>;
  onToggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
}) {
  return (
    <section aria-labelledby="top10-heading">
      <div className="mb-4 flex items-center gap-2">
        <RankTarget />
        <SidebarHeading id="top10-heading" className="mb-0">
          Top 10 · relevance
        </SidebarHeading>
      </div>
      {items.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          No high-relevance studies in the past 12 months yet.
        </p>
      ) : (
        <TopTenList items={items} saved={saved} onToggleSave={onToggleSave} />
      )}
    </section>
  );
}

function RankTarget() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-[#2A79A7]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
