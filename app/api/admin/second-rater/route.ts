import { NextRequest, NextResponse } from "next/server";
import { verifyFeed2Password } from "@/lib/brief/adminAuth";
import { saveSecondRaterScore } from "@/lib/brief/secondRater";
import { getDefaultTopicId } from "@/lib/feed";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      pmid?: string;
      rating?: number | null;
      secret?: string;
    };
    if (!verifyFeed2Password(body.secret)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const pmid = body.pmid?.trim();
    if (!pmid) {
      return NextResponse.json({ ok: true });
    }

    let rating: number | null = body.rating ?? null;
    if (rating != null) {
      if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
        return NextResponse.json(
          { ok: false, error: "rating must be 1–10" },
          { status: 400 }
        );
      }
      rating = Math.round(rating);
    }

    const topicId = await getDefaultTopicId();
    if (!topicId) {
      return NextResponse.json(
        { ok: false, error: "No default topic" },
        { status: 500 }
      );
    }

    const saved = await saveSecondRaterScore({
      supabase: getSupabaseServerClient(),
      topicId,
      pmid,
      rating,
    });
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: "That paper is not in the second-rater queue" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, pmid, rating });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
