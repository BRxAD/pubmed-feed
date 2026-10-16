/** One ingest period. The lead is the top-ranked story inside the newest period. */
export const BRIEF_INGEST_PERIOD_MS = 24 * 60 * 60 * 1000;

export type BriefOrderItem = {
  effectivePriority: number;
  relevancePercent: number;
  fetchedAt?: string | null;
  createdAt: string;
  date: string | null;
};

function parseTimestamp(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const t = new Date(raw.includes("T") ? raw : `${raw.slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function ingestMs(item: BriefOrderItem): number {
  return parseTimestamp(item.fetchedAt ?? item.createdAt);
}

function articleMs(item: BriefOrderItem): number {
  return parseTimestamp(item.date ?? item.createdAt);
}

/** Newest period is 0. A missing ingest time sorts after every real period. */
export function ingestPeriodIndex(item: BriefOrderItem, now = Date.now()): number {
  const t = ingestMs(item);
  if (t <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.floor(Math.max(0, now - t) / BRIEF_INGEST_PERIOD_MS);
}

/** Higher priority, then higher relevance, then newer. */
export function compareBriefRank(a: BriefOrderItem, b: BriefOrderItem): number {
  if (b.effectivePriority !== a.effectivePriority) {
    return b.effectivePriority - a.effectivePriority;
  }
  if (b.relevancePercent !== a.relevancePercent) {
    return b.relevancePercent - a.relevancePercent;
  }
  const recency = Math.max(articleMs(b), ingestMs(b)) - Math.max(articleMs(a), ingestMs(a));
  if (recency !== 0) return recency;
  const published = articleMs(b) - articleMs(a);
  if (published !== 0) return published;
  return ingestMs(b) - ingestMs(a);
}

/**
 * Newest 24-hour ingest period first. Inside a period, highest priority, then
 * relevance. The first story is the lead: the top-ranked paper ingested in the
 * last 24 hours (or the newest period that has a story).
 */
export function compareBriefDisplay(a: BriefOrderItem, b: BriefOrderItem, now = Date.now()): number {
  const period = ingestPeriodIndex(a, now) - ingestPeriodIndex(b, now);
  if (period !== 0) return period;
  return compareBriefRank(a, b);
}
