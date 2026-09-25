/** Parse and collapse email addresses so one inbox is not mailed twice. */

const ANGLE_EMAIL = /<([^<>\s]+@[^<>\s]+)>/;
const BARE_EMAIL = /[^\s,;<>()"]+@[^\s,;<>()"]+/;

export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("mailto:")) s = s.slice(7).trim();

  const angled = s.match(ANGLE_EMAIL);
  if (angled?.[1]) s = angled[1].trim().toLowerCase();
  else {
    const bare = s.match(BARE_EMAIL);
    if (bare?.[0]) s = bare[0].trim().toLowerCase();
  }

  s = s.replace(/^['"]+|['"]+$/g, "");
  const at = s.lastIndexOf("@");
  if (at <= 0 || at === s.length - 1) return null;
  const local = s.slice(0, at).replace(/^\.+|\.+$/g, "");
  const domain = s.slice(at + 1).replace(/\.+$/g, "");
  if (!local || !domain || !domain.includes(".")) return null;
  return `${local}@${domain}`;
}

/**
 * Same-inbox key. Gmail ignores dots and plus-tags, so
 * amkang@gmail.com and a.mkang+brief@gmail.com are one recipient.
 */
export function canonicalEmailInbox(raw: string | null | undefined): string | null {
  const normalized = normalizeEmailAddress(raw);
  if (!normalized) return null;
  const at = normalized.lastIndexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const withoutPlus = local.split("+")[0] ?? local;
    const withoutDots = withoutPlus.replace(/\./g, "");
    if (!withoutDots) return null;
    return `${withoutDots}@gmail.com`;
  }
  return normalized;
}

export type UniqueRecipient = {
  /** Address we actually send to. */
  sendTo: string;
  /** Dedup key (Gmail-canonical). */
  inboxKey: string;
};

/** Keep the first address for each inbox. */
export function uniqueRecipientsByInbox(emails: string[]): UniqueRecipient[] {
  const seen = new Set<string>();
  const out: UniqueRecipient[] = [];
  for (const raw of emails) {
    const sendTo = normalizeEmailAddress(raw);
    if (!sendTo) continue;
    const inboxKey = canonicalEmailInbox(sendTo);
    if (!inboxKey || seen.has(inboxKey)) continue;
    seen.add(inboxKey);
    out.push({ sendTo, inboxKey });
  }
  return out;
}

/** Eastern calendar date YYYY-MM-DD (Brief send day). */
export function easternCalendarDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Pull addresses out of a name/list string (env vars, pasted lists). */
export function extractEmailAddresses(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return uniqueRecipientsByInbox(
    raw.split(/[,;]+/g).flatMap((part) => {
      const trimmed = part.trim();
      return trimmed ? [trimmed] : [];
    })
  ).map((r) => r.sendTo);
}
