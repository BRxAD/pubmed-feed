"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news/types";
import { newsSourceLabel } from "@/lib/news/labels";
import { brief } from "@/components/brief/briefTheme";

type Props = { secret: string };

export default function NewsApprovalQueue({ secret }: Props) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { poll?: boolean }) => {
      setError(null);
      if (opts?.poll) setPolling(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ status });
        if (opts?.poll) params.set("poll", "1");
        const res = await fetch(`/api/brief/news?${params}`, {
          headers: { "x-brief-admin-secret": secret },
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          items?: NewsItem[];
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load news");
        }
        setItems(data.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setPolling(false);
      }
    },
    [secret, status]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function setItemStatus(
    id: string,
    next: "approved" | "rejected" | "pending"
  ) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/brief/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-brief-admin-secret": secret,
        },
        body: JSON.stringify({ id, status: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Update failed");
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={`rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={`${brief.kicker} mb-2`}>In the news</h2>
          <p className={`${brief.sans} text-sm ${brief.muted}`}>
            WHO, CIDRAP, and Google News RSS. Approve items before they appear on
            the Brief homepage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ poll: true })}
          disabled={polling}
          className={`${brief.action} disabled:opacity-60`}
        >
          {polling ? "Fetching feeds…" : "Fetch feeds now"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`${brief.sans} rounded-sm border px-3 py-1.5 text-xs capitalize ${
              status === s
                ? "border-[#1C0B19] bg-[#1C0B19] text-[#F6F4EF]"
                : `border-[#D8D4C8] ${brief.ink} hover:bg-[#EFECE4]`
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className={`mt-4 ${brief.sans} text-sm text-[#9B3A3A]`}>{error}</p>
      )}

      {loading ? (
        <p className={`mt-6 ${brief.sans} text-sm ${brief.muted}`}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={`mt-6 ${brief.sans} text-sm ${brief.muted}`}>
          No {status} items.{" "}
          {status === "pending"
            ? "Fetch feeds, or run the news-rss cron after creating the table."
            : null}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-sm border ${brief.hairline} bg-[#F6F4EF] px-4 py-3`}
            >
              <div className="flex gap-3">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher hosts
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-16 w-24 shrink-0 object-cover rounded-sm"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${brief.serif} text-base font-semibold ${brief.accentHover}`}
                  >
                    {item.title}
                  </a>
                  {item.summary && (
                    <p
                      className={`mt-1.5 ${brief.sans} text-sm leading-snug ${brief.muted} line-clamp-2`}
                    >
                      {item.summary}
                    </p>
                  )}
                  <p
                    className={`mt-1.5 ${brief.sans} text-[0.65rem] ${brief.muted}`}
                  >
                    {newsSourceLabel(item.sourceId)}
                    {item.publishedAt
                      ? ` · ${new Date(item.publishedAt).toLocaleDateString("en-US")}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {status !== "approved" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void setItemStatus(item.id, "approved")}
                    className={`${brief.action} disabled:opacity-60`}
                  >
                    Approve
                  </button>
                )}
                {status !== "rejected" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void setItemStatus(item.id, "rejected")}
                    className={`${brief.action} disabled:opacity-60`}
                  >
                    Reject
                  </button>
                )}
                {status !== "pending" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void setItemStatus(item.id, "pending")}
                    className={`${brief.action} disabled:opacity-60`}
                  >
                    Back to pending
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
