import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runScheduledPriorityRetrain } from "@/lib/brief/retrainSchedule";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retrain priority models when due (≥ 48h since last train).
 * Schedule: daily check at 22:00 UTC (18:00 Eastern) — actual retrain at most
 * every 48 hours. Admin ratings no longer retrain inline (egress).
 *
 *   GET /api/cron/retrain-priority?secret=YOUR_CRON_SECRET
 *   GET /api/cron/retrain-priority?secret=...&force=1  (ignore 48h gate)
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

  const force =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase env vars" },
      { status: 503 }
    );
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await runScheduledPriorityRetrain(supabase, { force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/retrain-priority]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
