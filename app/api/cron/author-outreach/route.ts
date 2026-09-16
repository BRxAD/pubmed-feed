import { NextRequest, NextResponse } from "next/server";
import { sendPendingAuthorOutreach } from "@/lib/digest/authorOutreach";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Send pending corresponding-author recognition emails (human rating 5+).
 * Schedule: 01:00 UTC (21:00 Eastern during EDT).
 *
 * GET /api/cron/author-outreach?secret=YOUR_CRON_SECRET
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
    return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
  }

  try {
    const outreach = await sendPendingAuthorOutreach();
    return NextResponse.json({ ok: true, outreach });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/author-outreach]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
