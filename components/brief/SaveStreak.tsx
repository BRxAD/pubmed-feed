"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  listMySavedArticles,
  syncLocalSavedArticles,
  toggleMySavedArticle,
} from "@/app/saved/actions";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import type { SavedBriefItem } from "@/lib/savedArticleTypes";

export type { SavedBriefItem };

const STREAK_KEY = "stewardship-brief-streak";
const SAVED_KEY = "stewardship-brief-saved";
const SAVED_SYNC_KEY = "stewardship-brief-saved-synced";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function bumpStreak(): number {
  const today = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);
  let count = 1;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { count: number; lastDate: string };
      if (parsed.lastDate === today) return parsed.count;
      if (parsed.lastDate === yKey) count = parsed.count + 1;
    }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ count, lastDate: today }));
  } catch {
    /* ignore */
  }
  return count;
}

function readSavedEntries(): SavedBriefItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    // Legacy: string[] of PMIDs
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return (parsed as string[]).map((pmid) => ({
        pmid,
        title: `PMID ${pmid}`,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      }));
    }
    if (Array.isArray(parsed)) {
      return (parsed as SavedBriefItem[]).filter(
        (e) => e && typeof e.pmid === "string" && e.pmid.trim()
      );
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeSavedEntries(entries: SavedBriefItem[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function useBriefSaved(): {
  saved: Set<string>;
  savedItems: SavedBriefItem[];
  toggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
  savedCount: number;
  signedIn: boolean;
  /** False until guest localStorage or signed-in account list has loaded. */
  ready: boolean;
} {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "";
  const signedIn = Boolean(userId);
  const [savedItems, setSavedItems] = useState<SavedBriefItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (!signedIn) {
      try {
        localStorage.removeItem(SAVED_SYNC_KEY);
      } catch {
        /* ignore */
      }
      setSavedItems(readSavedEntries());
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    void (async () => {
      const alreadySynced =
        typeof window !== "undefined" &&
        localStorage.getItem(SAVED_SYNC_KEY) === userId;
      const local = alreadySynced ? [] : readSavedEntries();
      const result =
        local.length > 0
          ? await syncLocalSavedArticles(local)
          : await listMySavedArticles();
      try {
        localStorage.setItem(SAVED_SYNC_KEY, userId);
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setSavedItems(result.items);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, status, userId]);

  const toggleSave = (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => {
    const title = meta?.title?.trim() || `PMID ${pmid}`;
    const pubmedUrl =
      meta?.pubmedUrl?.trim() || `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

    setSavedItems((prev) => {
      const exists = prev.some((e) => e.pmid === pmid);
      const next = exists
        ? prev.filter((e) => e.pmid !== pmid)
        : [{ pmid, title, pubmedUrl }, ...prev];
      if (!signedIn) writeSavedEntries(next);
      return next;
    });

    if (signedIn) {
      const exists = savedItems.some((e) => e.pmid === pmid);
      void toggleMySavedArticle({
        pmid,
        title,
        pubmedUrl,
        saved: !exists,
      });
    }
  };

  return {
    saved: new Set(savedItems.map((e) => e.pmid)),
    savedItems,
    toggleSave,
    savedCount: savedItems.length,
    signedIn,
    ready,
  };
}

export default function SaveStreak({
  savedCount,
  savedItems,
  onRemove,
  signedIn = false,
}: {
  savedCount: number;
  savedItems: SavedBriefItem[];
  onRemove: (pmid: string) => void;
  signedIn?: boolean;
}) {
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setStreak(bumpStreak());
  }, []);

  useEffect(() => {
    if (savedCount === 0) setOpen(false);
  }, [savedCount]);

  return (
    <section aria-labelledby="streak-heading">
      <SidebarHeading id="streak-heading">Your brief</SidebarHeading>
      <p className={`${brief.sans} text-sm leading-[1.55] ${brief.ink}`}>
        <span className="tabular-nums font-medium">{streak}</span>
        -day reading streak
      </p>

      <button
        type="button"
        onClick={() => savedCount > 0 && setOpen((v) => !v)}
        disabled={savedCount === 0}
        aria-expanded={open}
        className={`mt-3 flex w-full items-center justify-between gap-2 text-left ${brief.sans} text-sm ${
          savedCount > 0
            ? `${brief.ink} hover:text-[#2A79A7]`
            : brief.muted
        }`}
      >
        <span>
          <span className="tabular-nums font-medium">{savedCount}</span> saved
          for later
        </span>
        {savedCount > 0 && (
          <span className={`${brief.meta} text-[#2A79A7]`}>
            {open ? "Hide ↑" : "View ↓"}
          </span>
        )}
      </button>

      {!signedIn ? (
        <p className={`mt-3 ${brief.sans} text-xs leading-relaxed ${brief.muted}`}>
          <Link href="/settings" className={brief.action}>
            Sign in
          </Link>{" "}
          to keep saved articles on this account.
        </p>
      ) : null}

      {open && savedItems.length > 0 && (
        <ul
          className={`mt-3 max-h-64 space-y-2 overflow-y-auto border-t ${brief.hairline} pt-3 pr-1`}
        >
          {savedItems.map((item) => (
            <li key={item.pmid} className="group flex items-start gap-2">
              <a
                href={item.pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-w-0 flex-1 ${brief.sans} text-[0.8125rem] leading-snug ${brief.ink} hover:text-[#2A79A7]`}
              >
                {item.title}
              </a>
              <button
                type="button"
                onClick={() => onRemove(item.pmid)}
                className={`shrink-0 ${brief.sans} text-[0.6875rem] uppercase tracking-wide ${brief.muted} opacity-70 hover:opacity-100 hover:text-[#1C0B19]`}
                aria-label={`Remove ${item.title} from saved`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
