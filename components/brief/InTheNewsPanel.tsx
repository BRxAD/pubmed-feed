"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/news/types";
import { newsSourceLabel } from "@/lib/news/labels";
import { isHttpUrl } from "@/lib/news/url";
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

function NewsThumb({
  src,
  onSteel,
}: {
  src: string;
  onSteel: boolean;
}) {
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
      className={`mb-2 aspect-[16/10] w-full object-cover ${
        onSteel ? "rounded-sm opacity-95" : "rounded-sm"
      }`}
    />
  );
}

/** Approved external news — use variant=onSteel on the solid steel panel. */
export default function InTheNewsPanel({
  items,
  variant = "default",
}: {
  items: NewsItem[];
  variant?: "default" | "onSteel";
}) {
  const onSteel = variant === "onSteel";
  const linked = items.filter((item) => isHttpUrl(item.url));

  return (
    <section aria-labelledby="in-the-news-heading">
      <h2
        id="in-the-news-heading"
        className={`${brief.sans} mb-4 border-b pb-2 text-[0.6875rem] font-medium uppercase tracking-[0.14em] ${
          onSteel
            ? "border-[#F6F4EF]/35 text-[#F6F4EF]"
            : `border-[#2A79A7]/25 ${brief.kicker}`
        }`}
      >
        In the news
      </h2>
      {linked.length === 0 ? (
        <p
          className={`${brief.sans} text-sm ${
            onSteel ? "text-[#F6F4EF]/75" : brief.muted
          }`}
        >
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
                  {item.imageUrl ? (
                    <NewsThumb src={item.imageUrl} onSteel={onSteel} />
                  ) : null}
                  <span
                    className={`${brief.serif} block text-[0.9375rem] font-semibold leading-snug line-clamp-3 underline-offset-2 group-hover:underline ${
                      onSteel
                        ? "text-[#F6F4EF] group-hover:text-[#FFA69E]"
                        : `${brief.ink} group-hover:text-[#2A79A7]`
                    }`}
                  >
                    {item.title}
                  </span>
                  {sourceLine ? (
                    <span
                      className={`mt-1.5 block text-[0.6rem] font-normal normal-case tracking-normal ${
                        onSteel
                          ? "text-[#F6F4EF]/45"
                          : "text-[#1C0B19]/40"
                      }`}
                    >
                      {sourceLine}
                      <span className="ml-1 opacity-80" aria-hidden>
                        ↗
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`mt-1.5 block text-[0.6rem] ${
                        onSteel ? "text-[#F6F4EF]/45" : "text-[#1C0B19]/40"
                      }`}
                    >
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
