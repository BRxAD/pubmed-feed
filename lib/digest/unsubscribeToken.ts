import { createHmac, timingSafeEqual } from "crypto";

function unsubscribeSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error(
      "Missing UNSUBSCRIBE_SECRET or CRON_SECRET for unsubscribe tokens"
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(payload)
    .digest("base64url");
}

/** Opaque token embedding the subscriber email (HMAC-signed). */
export function createUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload = Buffer.from(normalized, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const raw = token?.trim();
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const email = Buffer.from(payload, "base64url")
      .toString("utf8")
      .trim()
      .toLowerCase();
    if (!email.includes("@")) return null;
    return email;
  } catch {
    return null;
  }
}

export function unsubscribeUrlForEmail(
  baseUrl: string,
  email: string
): string {
  const token = createUnsubscribeToken(email);
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/brief/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function unsubscribeApiUrlForEmail(
  baseUrl: string,
  email: string
): string {
  const token = createUnsubscribeToken(email);
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/brief/unsubscribe?token=${encodeURIComponent(token)}`;
}
