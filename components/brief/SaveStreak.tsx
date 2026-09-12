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
import { signIn, useSession } from "next-auth/react";
import { brief } from "@/components/brief/briefTheme";
import { SidebarHeading } from "@/components/brief/SidebarCard";
import {
  mergeSavedLists,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.98 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

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

async function apiPull(): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const res = await fetch("/api/saved", {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json()) as {
    items?: SavedBriefItem[];
    error?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error:
      data.error ||
      (!res.ok ? "Could not sync saved articles. Try signing in again." : undefined),
  };
}

/** Additive only — used once to upload leftover local saves onto an empty account. */
async function apiMigrateLocal(items: SavedBriefItem[]): Promise<{
  items: SavedBriefItem[];
  error?: string;
}> {
  const res = await fetch("/api/saved", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", items }),
  });
  const data = (await res.json()) as {
    items?: SavedBriefItem[];
    error?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error:
      data.error ||
      (!res.ok ? "Could not sync saved articles. Try signing in again." : undefined),
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
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", ...input }),
  });
  const data = (await res.json()) as {
    items?: SavedBriefItem[];
    error?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    error:
      data.error ||
      (!res.ok ? "Could not update saved article. Try signing in again." : undefined),
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
  /** True after a guest taps Save — show the sign-in prompt in the saved box. */
  loginPrompt: boolean;
  setLoginPrompt: (show: boolean) => void;
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
  const [loginPrompt, setLoginPrompt] = useState(false);
  const syncGenRef = useRef(0);
  const savedItemsRef = useRef<SavedBriefItem[]>([]);

  useEffect(() => {
    savedItemsRef.current = savedItems;
  }, [savedItems]);

  const applyAccountItems = useCallback((items: SavedBriefItem[]) => {
    writeSavedEntries(items);
    setSavedItems(items);
  }, []);

  /**
   * Account list wins. Never push this device's full local list on refresh —
   * that re-created deleted articles from a stale browser cache.
   * Only migrate local leftovers when the account itself is empty.
   */
  const pullFromAccount = useCallback(
    async (opts?: { quiet?: boolean; allowMigrate?: boolean }) => {
      if (!signedIn) return;
      const gen = ++syncGenRef.current;
      try {
        const pulled = await apiPull();
        if (gen !== syncGenRef.current) return;

        if (pulled.error) {
          const local = readSavedEntries();
          setSavedItems(mergeSavedLists(local, pulled.items));
          if (!opts?.quiet) setSyncError(pulled.error);
          return;
        }

        if (opts?.allowMigrate && pulled.items.length === 0) {
          const local = readSavedEntries();
          if (local.length > 0) {
            const migrated = await apiMigrateLocal(local);
            if (gen !== syncGenRef.current) return;
            if (migrated.error) {
              setSavedItems(local);
              if (!opts?.quiet) setSyncError(migrated.error);
              return;
            }
            applyAccountItems(migrated.items);
            setSyncError(undefined);
            return;
          }
        }

        applyAccountItems(pulled.items);
        setSyncError(undefined);
      } catch {
        if (!opts?.quiet) {
          setSyncError("Could not sync saved articles. Try refreshing.");
        }
      } finally {
        if (gen === syncGenRef.current) {
          setReady(true);
        }
      }
    },
    [applyAccountItems, signedIn]
  );

  useEffect(() => {
    if (status === "loading") return;

    if (!signedIn) {
      // Guests cannot save — keep the list empty (local leftovers migrate
      // only if they later sign in to an account with no saves yet).
      setSavedItems([]);
      setSyncError(undefined);
      setReady(true);
      return;
    }

    setLoginPrompt(false);
    setReady(false);
    void pullFromAccount({ allowMigrate: true });
  }, [signedIn, status, userId, userEmail, pullFromAccount]);

  // When returning to this tab/device, pull the shared account list again.
  useEffect(() => {
    if (!signedIn) return;

    const onFocus = () => {
      void pullFromAccount({ quiet: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pullFromAccount({ quiet: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signedIn, pullFromAccount]);

  const toggleSave = useCallback(
    (
      pmid: string,
      meta?: { title?: string | null; pubmedUrl?: string | null }
    ) => {
      if (!signedIn) {
        setLoginPrompt(true);
        return;
      }

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

      // Invalidate in-flight pulls so a stale GET cannot undo this toggle.
      const gen = ++syncGenRef.current;

      void (async () => {
        const result = await apiToggle({
          pmid,
          title,
          pubmedUrl,
          saved: !exists,
        });
        if (gen !== syncGenRef.current) return;
        if (result.error) {
          setSyncError(result.error);
          return;
        }
        applyAccountItems(result.items);
        setSyncError(undefined);
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
      loginPrompt,
      setLoginPrompt,
    }),
    [loginPrompt, ready, savedItems, signedIn, syncError, toggleSave]
  );

  return (
    <BriefSavedContext.Provider value={value}>
      {children}
      {loginPrompt && !signedIn && (
        <aside
          role="dialog"
          aria-label="Sign in to save articles"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-50 rounded-sm border border-[#D8D4C8] bg-[#FAF9F5] p-4 shadow-xl text-[#1C0B19]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif font-semibold text-sm sm:text-base text-[#1C0B19]">
                Sign in to save articles
              </p>
              <p className="font-sans text-xs text-[#72705B] mt-0.5 leading-relaxed">
                Sign in to save articles to your reading list and sync them across your devices.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLoginPrompt(false)}
              className="text-[#72705B] hover:text-[#1C0B19] text-xs p-1"
              aria-label="Close sign in prompt"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                signIn("google", {
                  callbackUrl:
                    typeof window !== "undefined"
                      ? window.location.href
                      : "/settings?tab=saved",
                })
              }
              className="flex items-center gap-1.5 rounded-sm border border-[#D8D4C8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C0B19] shadow-xs hover:border-[#72705B] transition-colors"
            >
              <GoogleIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Continue with Google</span>
            </button>
            <Link
              href="/settings?tab=saved"
              onClick={() => setLoginPrompt(false)}
              className="text-xs font-medium text-[#2A79A7] hover:underline"
            >
              or sign in with email →
            </Link>
          </div>
        </aside>
      )}
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
  syncError,
  loginPrompt = false,
}: {
  savedCount: number;
  savedItems: SavedBriefItem[];
  onRemove: (pmid: string) => void;
  signedIn?: boolean;
  syncError?: string;
  loginPrompt?: boolean;
}) {
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(false);
  const promptRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setStreak(bumpStreak());
  }, []);

  useEffect(() => {
    if (savedCount === 0) setOpen(false);
  }, [savedCount]);

  useEffect(() => {
    if (!loginPrompt || signedIn) return;
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [loginPrompt, signedIn]);

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
        <p
          ref={promptRef}
          className={`mt-3 ${brief.sans} text-xs leading-relaxed ${
            loginPrompt
              ? "rounded-sm border border-[#2A79A7]/35 bg-[#2A79A7]/10 px-2.5 py-2 text-[#1C0B19]"
              : brief.muted
          }`}
          role={loginPrompt ? "status" : undefined}
        >
          {loginPrompt ? (
            <>
              Sign in to save this article.{" "}
              <Link href="/settings?tab=saved" className={brief.action}>
                Sign in
              </Link>
            </>
          ) : (
            <>
              <Link href="/settings?tab=saved" className={brief.action}>
                Sign in
              </Link>{" "}
              to save articles for later.
            </>
          )}
        </p>
      ) : null}

      {signedIn && syncError ? (
        <p className={`mt-3 ${brief.sans} text-xs leading-relaxed text-red-800`} role="alert">
          {syncError}
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
