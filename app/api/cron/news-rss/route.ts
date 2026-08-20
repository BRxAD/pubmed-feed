import { NextRequest, NextResponse } from "next/server";
import { ingestNewsFeeds } from "@/lib/news/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Poll WHO / CIDRAP / Google News RSS into news_items as pending.
 * Schedule: once daily (UTC). Approve in Brief settings before homepage.
 *
 * GET /api/cron/news-rss?secret=YOUR_CRON_SECRET
 * Authorization: Bearer YOUR_CRON_SECRET
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
      { ok: false, error: "CRON_SECRET is not set on the server." },
      { status: 503 }
    );
  }
  if (secret !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
  }

  try {
    const result = await ingestNewsFeeds();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/news-rss]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
