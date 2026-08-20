"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news/types";
import { newsSourceLabel } from "@/lib/news/labels";

type Props = { secret: string };

const tabIdle =
  "rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs capitalize text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";
const tabActive =
  "rounded-lg border border-zinc-800 bg-zinc-800 px-3 py-1.5 text-xs capitalize font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";
const actionBtn =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";
const primaryBtn =
  "rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-600 dark:hover:bg-zinc-500";

/** Approve queue for In the news — styled for the dark-friendly /feed chrome. */
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
    <section
      className="rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60"
      aria-label="In the news approvals"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            In the news
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            WHO, CIDRAP, and Google News RSS. Only items with a working article
            link are listed. Approve before they appear on the Brief homepage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ poll: true })}
          disabled={polling}
          className={primaryBtn}
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
            className={status === s ? tabActive : tabIdle}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          No {status} items.{" "}
          {status === "pending"
            ? "Fetch feeds, or run the news-rss cron after creating the table."
            : null}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700/60 dark:bg-zinc-950/50"
            >
              <div className="flex gap-3">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher hosts
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-16 w-24 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    {item.title}
                  </a>
                  {item.summary && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                      {item.summary}
                    </p>
                  )}
                  <p className="mt-1.5 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
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
                    className={actionBtn}
                  >
                    Approve
                  </button>
                )}
                {status !== "rejected" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void setItemStatus(item.id, "rejected")}
                    className={actionBtn}
                  >
                    Reject
                  </button>
                )}
                {status !== "pending" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void setItemStatus(item.id, "pending")}
                    className={actionBtn}
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
