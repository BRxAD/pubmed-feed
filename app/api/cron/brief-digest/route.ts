import { NextRequest, NextResponse } from "next/server";
import { runBriefDigest } from "@/lib/digest/runBriefDigest";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Send The Stewardship Brief to all brief_subscribers.
 *
 * Sends The Stewardship Brief to all brief_subscribers.
 * Runs after daily ingest (same cron schedule as daily-digest, ~11:00 UTC).
 *
 * Can also be triggered manually:
 *   GET /api/cron/brief-digest?secret=YOUR_CRON_SECRET
 *   Authorization: Bearer YOUR_CRON_SECRET
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
      { ok: false, error: "Invalid secret" },
      { status: 401 }
    );
  }

  try {
    const briefEmail = await runBriefDigest();
    return NextResponse.json({ ok: true, briefEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/brief-digest]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
