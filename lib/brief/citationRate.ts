/** Average Gregorian month. Used only to rank citations per month. */
export const CITATION_MONTH_DAYS = 30.4375;

/** Papers younger than one month are treated as one month old. */
export const CITATION_MIN_MONTHS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseCitedByCount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function publicationMs(dateIso: string): number | null {
  const day = dateIso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** Months since publication, or null when the date is missing or in the future. */
export function monthsSincePublication(
  dateIso: string | null | undefined,
  nowMs: number
): number | null {
  if (!dateIso?.trim()) return null;
  const published = publicationMs(dateIso);
  if (published == null) return null;
  const days = (nowMs - published) / DAY_MS;
  if (days < 0) return null;
  return Math.max(CITATION_MIN_MONTHS, days / CITATION_MONTH_DAYS);
}

/** Citations divided by months since publication. Null when it cannot be ranked. */
export function citationsPerMonth(
  count: number,
  dateIso: string | null | undefined,
  nowMs: number
): number | null {
  if (!Number.isFinite(count) || count < 0) return null;
  const months = monthsSincePublication(dateIso, nowMs);
  if (months == null) return null;
  return count / months;
}

export function isWithinDays(
  dateIso: string | null | undefined,
  nowMs: number,
  days: number
): boolean {
  if (!dateIso?.trim()) return false;
  const published = publicationMs(dateIso);
  if (published == null) return false;
  const age = nowMs - published;
  return age >= 0 && age <= days * DAY_MS;
}
