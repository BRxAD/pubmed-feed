import { NextRequest, NextResponse } from "next/server";
import { getDefaultTopicId } from "@/lib/feed";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import {
  DEFAULT_FEED_SETTINGS,
  mergeFeedSettings,
  type BriefFeedSettings,
} from "@/lib/brief/feedSettings";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function authSecret(request: NextRequest): string | null {
  return (
    request.headers.get("x-brief-admin-secret") ??
    request.nextUrl.searchParams.get("secret")
  );
}

export async function GET(request: NextRequest) {
  const secret = authSecret(request);
  if (!verifyBriefAdminSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const topicId = await getDefaultTopicId();
    if (!topicId) {
      return NextResponse.json({ ok: false, error: "No default topic" }, { status: 404 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("topics")
      .select("id, name, ranking_weights")
      .eq("id", topicId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Topic not found" },
        { status: 500 }
      );
    }

    const settings = mergeFeedSettings(
      (data as { ranking_weights?: Record<string, unknown> | null }).ranking_weights
    );

    return NextResponse.json({
      ok: true,
      topicId,
      topicName: (data as { name?: string }).name ?? "Main topic",
      settings,
      defaults: DEFAULT_FEED_SETTINGS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const secret = authSecret(request);
  if (!verifyBriefAdminSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { settings?: Partial<BriefFeedSettings> };
    if (!body.settings || typeof body.settings !== "object") {
      return NextResponse.json(
        { ok: false, error: "settings object required" },
        { status: 400 }
      );
    }

    const topicId = await getDefaultTopicId();
    if (!topicId) {
      return NextResponse.json({ ok: false, error: "No default topic" }, { status: 404 });
    }

    const supabase = getSupabaseServerClient();
    const { data: topicRow } = await supabase
      .from("topics")
      .select("ranking_weights")
      .eq("id", topicId)
      .maybeSingle();

    const merged = mergeFeedSettings({
      ...mergeFeedSettings(
        (topicRow as { ranking_weights?: Record<string, unknown> | null } | null)
          ?.ranking_weights
      ),
      ...body.settings,
      brief: {
        ...mergeFeedSettings(
          (topicRow as { ranking_weights?: Record<string, unknown> | null } | null)
            ?.ranking_weights
        ).brief,
        ...(body.settings.brief ?? {}),
      },
    });

    const { error } = await supabase
      .from("topics")
      .update({ ranking_weights: merged })
      .eq("id", topicId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
