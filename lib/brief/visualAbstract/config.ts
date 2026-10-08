/**
 * Settings for the visual abstract (beta), read from the environment.
 *
 *   VISUAL_ABSTRACT_URL           https address of the Visual Abstract service (no trailing path)
 *   VISUAL_ABSTRACT_KEY           the shared key the service expects (at least 24 characters)
 *   VISUAL_ABSTRACT_ENABLED       "0" switches the feature off at once (the dialog offers the text graphic)
 *   VISUAL_ABSTRACT_USER_PER_HOUR new papers one person may start per hour (default 5)
 *   VISUAL_ABSTRACT_PER_DAY       new papers started per day, everyone together (default 40)
 */

export type VaConfig = {
  /** "on" works; "off" was switched off on purpose; "unconfigured" has no service address or key yet. */
  state: "on" | "off" | "unconfigured";
  serviceUrl: string | null;
  serviceKey: string | null;
  userPerHour: number;
  perDay: number;
};

export const MIN_SERVICE_KEY_LENGTH = 24;
export const DEFAULT_USER_PER_HOUR = 5;
export const DEFAULT_PER_DAY = 40;

type Env = Record<string, string | undefined>;

function whole(raw: string | undefined, fallback: number, max = 1000): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.floor(n));
}

/** https only (http is accepted for localhost, so the service can be tried on one machine). */
export function normalizeServiceUrl(raw: string | undefined): string | null {
  const text = (raw ?? "").trim().replace(/\/+$/, "");
  if (!text) return null;
  try {
    const url = new URL(text);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
}

export function readVaConfig(env: Env = process.env): VaConfig {
  const serviceUrl = normalizeServiceUrl(env.VISUAL_ABSTRACT_URL);
  const key = (env.VISUAL_ABSTRACT_KEY ?? "").trim();
  const serviceKey = key.length >= MIN_SERVICE_KEY_LENGTH ? key : null;
  const off = (env.VISUAL_ABSTRACT_ENABLED ?? "").trim() === "0";
  return {
    state: off ? "off" : serviceUrl && serviceKey ? "on" : "unconfigured",
    serviceUrl,
    serviceKey,
    userPerHour: whole(env.VISUAL_ABSTRACT_USER_PER_HOUR, DEFAULT_USER_PER_HOUR),
    perDay: whole(env.VISUAL_ABSTRACT_PER_DAY, DEFAULT_PER_DAY),
  };
}
