import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  saveAdminPriority,
  type FeatureSnapshot,
} from "@/lib/relevanceLearning";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      topicId?: string;
      pmid?: string;
      priority?: number | null;
      featureSnapshot?: FeatureSnapshot;
    };

    const topicId = body.topicId?.trim();
    const pmid = body.pmid?.trim();
    if (!topicId || !pmid) {
      return NextResponse.json(
        { ok: false, error: "topicId and pmid required" },
        { status: 400 }
      );
    }

    let priority: number | null = body.priority ?? null;
    if (priority != null) {
      if (!Number.isFinite(priority) || priority < 1 || priority > 10) {
        return NextResponse.json(
          { ok: false, error: "priority must be 1–10 or null" },
          { status: 400 }
        );
      }
      priority = Math.round(priority);
    }

    const snapshot = body.featureSnapshot ?? {
      stewardshipTitle: 0,
      stewardshipAbstract: 0,
      largeStudy: 0,
      extraTerms: 0,
      studyBoostFactor: 1,
      jifBoostFactor: 1,
      algorithmicScore: 0,
    };

    const supabase = getSupabase();
    await saveAdminPriority({
      topicId,
      pmid,
      priority,
      snapshot,
      supabase,
    });

    return NextResponse.json({ ok: true, topicId, pmid, priority });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
