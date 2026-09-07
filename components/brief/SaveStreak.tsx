"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import {
  mergeSavedLists,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

export type { SavedBriefItem };

const STREAK_KEY = "stewardship-brief-streak";
const SAVED_KEY = "stewardship-brief-saved";

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

async function apiSync(items: SavedBriefItem[]): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const res = await fetch("/api/saved", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", items }),
  });
  const data = (await res.json()) as {
    items?: SavedBriefItem[];
    error?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error: data.error,
  };
}

async function apiToggle(input: {
  pmid: string;
  title: string;
  pubmedUrl: string;
  saved: boolean;
}): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const res = await fetch("/api/saved", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", ...input }),
  });
  const data = (await res.json()) as {
    items?: SavedBriefItem[];
    error?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error: !res.ok ? data.error || "Could not update saved article." : data.error,
  };
}

type BriefSavedContextValue = {
  saved: Set<string>;
  savedItems: SavedBriefItem[];
  toggleSave: (
    pmid: string,
    meta?: { title?: string | null; pubmedUrl?: string | null }
  ) => void;
  savedCount: number;
  signedIn: boolean;
  ready: boolean;
  syncError?: string;
};

const BriefSavedContext = createContext<BriefSavedContextValue | null>(null);

export function BriefSavedProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "";
  const userEmail = session?.user?.email ?? "";
  const signedIn = Boolean(userId) || Boolean(userEmail);
  const [savedItems, setSavedItems] = useState<SavedBriefItem[]>([]);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | undefined>();
  const syncingRef = useRef(false);
  const savedItemsRef = useRef<SavedBriefItem[]>([]);

  useEffect(() => {
    savedItemsRef.current = savedItems;
  }, [savedItems]);

  const applyAccountItems = useCallback((items: SavedBriefItem[]) => {
    writeSavedEntries(items);
    setSavedItems(items);
  }, []);

  const syncFromAccount = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!signedIn || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const local = readSavedEntries();
        const result = await apiSync(local);
        if (result.error && result.items.length === 0) {
          // Keep device saves if the account call failed completely.
          setSavedItems(local);
          if (!opts?.quiet) setSyncError(result.error);
          return;
        }
        // Account list is the source of truth after a successful push/pull.
        const merged = mergeSavedLists(result.items, local);
        applyAccountItems(result.items.length > 0 ? result.items : merged);
        setSyncError(undefined);
      } catch {
        if (!opts?.quiet) {
          setSyncError("Could not sync saved articles. Try refreshing.");
        }
      } finally {
        syncingRef.current = false;
        setReady(true);
      }
    },
    [applyAccountItems, signedIn]
  );

  useEffect(() => {
    if (status === "loading") return;

    if (!signedIn) {
      setSavedItems(readSavedEntries());
      setSyncError(undefined);
      setReady(true);
      return;
    }

    setReady(false);
    void syncFromAccount();
  }, [signedIn, status, userId, userEmail, syncFromAccount]);

  // When returning to this tab/device, pull the shared account list again.
  useEffect(() => {
    if (!signedIn) return;

    const onFocus = () => {
      void syncFromAccount({ quiet: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromAccount({ quiet: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signedIn, syncFromAccount]);

  const toggleSave = useCallback(
    (
      pmid: string,
      meta?: { title?: string | null; pubmedUrl?: string | null }
    ) => {
      const title = meta?.title?.trim() || `PMID ${pmid}`;
      const pubmedUrl =
        meta?.pubmedUrl?.trim() || `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      const prev = savedItemsRef.current;
      const exists = prev.some((e) => e.pmid === pmid);
      const next = exists
        ? prev.filter((e) => e.pmid !== pmid)
        : [{ pmid, title, pubmedUrl }, ...prev];

      // Optimistic device mirror (also helps if the network call is slow).
      writeSavedEntries(next);
      setSavedItems(next);

      if (!signedIn) return;

      void (async () => {
        const result = await apiToggle({
          pmid,
          title,
          pubmedUrl,
          saved: !exists,
        });
        if (result.error && result.items.length === 0) {
          setSyncError(result.error);
          return;
        }
        // Prefer the account list returned by the API.
        if (result.items.length > 0 || !result.error) {
          applyAccountItems(result.items);
          setSyncError(undefined);
        }
      })();
    },
    [applyAccountItems, signedIn]
  );

  const value = useMemo<BriefSavedContextValue>(
    () => ({
      saved: new Set(savedItems.map((e) => e.pmid)),
      savedItems,
      toggleSave,
      savedCount: savedItems.length,
      signedIn,
      ready,
      syncError,
    }),
    [ready, savedItems, signedIn, syncError, toggleSave]
  );

  return (
    <BriefSavedContext.Provider value={value}>
      {children}
    </BriefSavedContext.Provider>
  );
}

export function useBriefSaved(): BriefSavedContextValue {
  const ctx = useContext(BriefSavedContext);
  if (!ctx) {
    throw new Error("useBriefSaved must be used within BriefSavedProvider");
  }
  return ctx;
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
