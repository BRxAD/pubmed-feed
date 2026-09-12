import { createHmac, timingSafeEqual } from "crypto";

function emailActionSecret(): string {
  const secret =
    process.env.EMAIL_ACTION_SECRET?.trim() ||
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "stewardship-brief-email-action-default";
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", emailActionSecret())
    .update(payload)
    .digest("base64url");
}

type SavePayload = {
  e: string; // email
  p: string; // pmid
  t: number; // created timestamp (ms)
};

/** 60-day validity for email action links. */
const MAX_TOKEN_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Creates an HMAC-signed token granting 1-click save permissions
 * for a specific article from a newsletter email sent to `email`.
 */
export function createEmailSaveToken(options: {
  email: string;
  pmid: string;
}): string {
  const normalizedEmail = options.email.trim().toLowerCase();
  const normalizedPmid = options.pmid.trim();

  const data: SavePayload = {
    e: normalizedEmail,
    p: normalizedPmid,
    t: Date.now(),
  };

  const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies an email save token. Returns the email and pmid if valid,
 * or null if invalid, expired, or tampered with.
 */
export function verifyEmailSaveToken(
  token: string | null | undefined
): { email: string; pmid: string } | null {
  const raw = token?.trim();
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(payload);
  } catch {
    return null;
  }

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<SavePayload>;
    if (!parsed.e || typeof parsed.e !== "string" || !parsed.e.includes("@")) {
      return null;
    }
    if (!parsed.p || typeof parsed.p !== "string") {
      return null;
    }
    if (
      typeof parsed.t === "number" &&
      Date.now() - parsed.t > MAX_TOKEN_AGE_MS
    ) {
      return null; // Expired
    }
    return {
      email: parsed.e.trim().toLowerCase(),
      pmid: parsed.p.trim(),
    };
  } catch {
    return null;
  }
}
