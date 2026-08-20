"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/news/types";
import { newsSourceLabel } from "@/lib/news/labels";
import { isHttpUrl } from "@/lib/news/url";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function NewsThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher hosts
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="mb-2 aspect-[16/10] w-full rounded-sm object-cover"
    />
  );
}

/** Approved external news for the Brief sidebar. */
export default function InTheNewsPanel({ items }: { items: NewsItem[] }) {
  const linked = items.filter((item) => isHttpUrl(item.url));

  return (
    <section aria-labelledby="in-the-news-heading">
      <SidebarHeading id="in-the-news-heading">In the news</SidebarHeading>
      {linked.length === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          No approved news items yet.
        </p>
      ) : (
        <ul className="space-y-5">
          {linked.map((item) => {
            const dateLabel = formatDate(item.publishedAt ?? item.approvedAt);
            const sourceLine = [
              newsSourceLabel(item.sourceId),
              dateLabel || null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={item.id} className={`${brief.sans} text-sm`}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block no-underline"
                >
                  {item.imageUrl ? <NewsThumb src={item.imageUrl} /> : null}
                  <span
                    className={`${brief.serif} block text-[0.9375rem] font-semibold leading-snug line-clamp-3 ${brief.ink} underline-offset-2 group-hover:text-[#2A79A7] group-hover:underline`}
                  >
                    {item.title}
                  </span>
                  {sourceLine ? (
                    <span className="mt-1.5 block text-[0.6rem] font-normal normal-case tracking-normal text-[#1C0B19]/40">
                      {sourceLine}
                      <span className="ml-1 opacity-80" aria-hidden>
                        ↗
                      </span>
                    </span>
                  ) : (
                    <span className="mt-1.5 block text-[0.6rem] text-[#1C0B19]/40">
                      Open article ↗
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
