"use client";

import { useEffect, useState } from "react";
import { brief } from "@/components/brief/briefTheme";

const STREAK_KEY = "stewardship-brief-streak";
const SAVED_KEY = "stewardship-brief-saved";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStreak(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return 0;
    const { count, lastDate } = JSON.parse(raw) as {
      count: number;
      lastDate: string;
    };
    const today = todayKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    if (lastDate === today) return count;
    if (lastDate === yKey) return count;
    return 0;
  } catch {
    return 0;
  }
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

export function useBriefSaved(): {
  saved: Set<string>;
  toggleSave: (pmid: string) => void;
  savedCount: number;
} {
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSave = (pmid: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(pmid)) next.delete(pmid);
      else next.add(pmid);
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return { saved, toggleSave, savedCount: saved.size };
}

export default function SaveStreak({ savedCount }: { savedCount: number }) {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setStreak(bumpStreak());
  }, []);

  return (
    <section aria-labelledby="streak-heading">
      <h2
        id="streak-heading"
        className={`${brief.kicker} mb-4 pb-2 border-b ${brief.hairline}`}
      >
        Your brief
      </h2>
      <p className={`${brief.sans} text-sm leading-[1.55] ${brief.ink}`}>
        <span className="tabular-nums font-medium">{streak}</span>
        -day reading streak
      </p>
      <p className={`mt-2 ${brief.sans} text-sm ${brief.muted}`}>
        {savedCount} saved for later
      </p>
    </section>
  );
}
