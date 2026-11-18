/** World AMR Awareness Week banner for Canadian Brief subscribers. */

export const AMR_AWARE_URL = "https://www.amraware.ca";
export const AMR_AWARE_IMAGE_PATH = "/amr-aware-canada.jpg";
/** Inclusive Eastern calendar dates (YYYY-MM-DD). */
export const AMR_AWARE_START = "2026-11-18";
export const AMR_AWARE_END = "2026-11-24";

/** Calendar date in America/New_York as YYYY-MM-DD. */
export function easternCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True when the address domain ends in .ca (not a .ca mention in the name). */
export function isCanadianEmailAddress(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const angle = trimmed.match(/<([^>]+)>/);
  const addr = (angle?.[1] ?? trimmed).trim();
  const at = addr.lastIndexOf("@");
  if (at < 1) return false;
  const domain = addr.slice(at + 1).replace(/\.+$/, "");
  return (
    domain.endsWith(".ca") &&
    domain.length > ".ca".length &&
    !domain.includes("..") &&
    !domain.startsWith(".") &&
    /^[a-z0-9.-]+$/.test(domain)
  );
}

/** Show the banner on Nov 18–24, 2026 emails sent to a .ca address. */
export function shouldShowAmrAwareBanner(
  email: string | undefined | null,
  now: Date = new Date()
): boolean {
  if (!email || !isCanadianEmailAddress(email)) return false;
  const day = easternCalendarDate(now);
  return day >= AMR_AWARE_START && day <= AMR_AWARE_END;
}
