"use client";

import type { NewsItem } from "@/lib/news/types";
import { newsSourceLabel } from "@/lib/news/labels";
import { brief } from "@/components/brief/briefTheme";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Homepage sidebar: approved external news only. */
export default function InTheNewsPanel({ items }: { items: NewsItem[] }) {
  return (
    <section aria-labelledby="in-the-news-heading">
      <h2
        id="in-the-news-heading"
        className={`${brief.kicker} mb-4 pb-2 border-b border-[#2A79A7]/25`}
      >
        In the news
      </h2>
      {items.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          No approved news items yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const dateLabel = formatDate(item.publishedAt ?? item.approvedAt);
            return (
              <li key={item.id} className={`${brief.sans} text-sm`}>
                <p
                  className={`${brief.meta} mb-1 text-[0.65rem] tracking-[0.08em] text-[#2A79A7]`}
                >
                  {newsSourceLabel(item.sourceId)}
                  {dateLabel ? ` · ${dateLabel}` : ""}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${brief.serif} text-[0.9375rem] font-semibold leading-snug ${brief.ink} no-underline hover:text-[#2A79A7] line-clamp-3`}
                >
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <p className={`mt-4 ${brief.sans} text-[0.7rem] leading-snug ${brief.muted}`}>
        External coverage · not peer-reviewed literature
      </p>
    </section>
  );
}
