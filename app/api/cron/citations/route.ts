import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCitationCounts } from "@/lib/citations/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * OpenAlex citation counts for articles that have never been checked,
 * recent papers last checked more than 7 days ago, then older papers
 * last checked more than 30 days ago. Batches of 100. One pass per night.
 *
 *   GET /api/cron/citations
 *   Authorization: Bearer YOUR_CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secretParam = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase env vars" },
      { status: 503 }
    );
  }

  const maxBatchesRaw = Number(request.nextUrl.searchParams.get("maxBatches"));
  const maxBatches =
    Number.isFinite(maxBatchesRaw) && maxBatchesRaw > 0
      ? Math.min(80, Math.floor(maxBatchesRaw))
      : undefined;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await syncCitationCounts(supabase, { maxBatches });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/citations]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
