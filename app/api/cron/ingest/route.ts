import { NextRequest, NextResponse } from "next/server";
import { getDefaultTopicId } from "@/lib/feed";

/**
 * GET /api/cron/ingest?secret=YOUR_CRON_SECRET
 * Or: Authorization: Bearer YOUR_CRON_SECRET (for Vercel Cron)
 *
 * Runs ingest for the default topic (antimicrobial stewardship).
 * Call daily at 5 AM EST from a cron service (e.g. cron-job.org, Vercel Cron).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secretParam = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = secretParam ?? bearerSecret;

  if (!expected?.trim() || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const topicId = await getDefaultTopicId();
  if (!topicId) {
    return NextResponse.json(
      { ok: false, error: "Default topic not found" },
      { status: 500 }
    );
  }

  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: data.error ?? res.statusText },
      { status: res.status >= 400 ? res.status : 502 }
    );
  }

  return NextResponse.json(data);
}
