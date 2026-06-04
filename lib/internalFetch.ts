import "server-only";

/**
 * Base URL for server-side calls to this app's own API routes.
 * Prefer VERCEL_URL so cron/digest never calls a different deployment via NEXT_PUBLIC_APP_URL.
 */
export function internalAppBaseUrl(): string {
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function internalFetchHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
  }
  return headers;
}
