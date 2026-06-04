import { NextRequest, NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/digest/runDailyDigest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily ingest (PubMed + OpenAlex), summarize new articles, email digest
 * for studies ≥ DIGEST_MIN_RELEVANCE (default 20%).
 *
 * GET /api/cron/daily-digest?secret=YOUR_CRON_SECRET
 * Authorization: Bearer YOUR_CRON_SECRET (Vercel Cron)
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secretParam = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = secretParam ?? bearerSecret;

  if (!expected?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.",
      },
      { status: 503 }
    );
  }

  if (secret !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid secret. If your secret contains / or =, URL-encode it in the browser, or use a letters-and-numbers-only secret.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await runDailyDigest();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/daily-digest]", message);
    const hint =
      message === "Unauthorized"
        ? " Cron auth succeeded; ingest failed (often NEXT_PUBLIC_APP_URL pointing at another deployment). Redeploy after the latest fix or check /api/health/env."
        : "";
    return NextResponse.json(
      { ok: false, error: message + hint },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
