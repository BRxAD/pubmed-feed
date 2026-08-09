import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { ArticleSetting } from "@/lib/classifySetting";
import { BRIEF_HOMEPAGE_CACHE_TAG } from "@/lib/brief/homepageCache";
import { TOP_PRIORITY_CACHE_TAG } from "@/lib/brief/topPriority";
import { FEED_SLIM_INDEX_CACHE_TAG } from "@/lib/feedCache";

export const runtime = "nodejs";

const VALID: ReadonlySet<string> = new Set([
  "hospital",
  "community",
  "long-term care",
  "dentistry",
  "one-health",
  "global-health",
  "animal",
  "environment",
]);

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
      setting?: string | null;
    };

    const topicId = body.topicId?.trim();
    const pmid = body.pmid?.trim();
    if (!topicId || !pmid) {
      return NextResponse.json(
        { ok: false, error: "topicId and pmid required" },
        { status: 400 }
      );
    }

    let setting: ArticleSetting | null = null;
    if (body.setting != null && String(body.setting).trim() !== "") {
      const raw = String(body.setting).trim();
      if (!VALID.has(raw)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "setting must be hospital, community, long-term care, dentistry, one-health, global-health, animal, environment, or null",
          },
          { status: 400 }
        );
      }
      setting = raw as ArticleSetting;
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("summaries")
      .update({ admin_setting: setting })
      .eq("topic_id", topicId)
      .eq("pmid", pmid);

    if (error) {
      if (error.message.toLowerCase().includes("admin_setting")) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "admin_setting column missing — run scripts/add_admin_setting.sql in Supabase",
          },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    revalidateTag(BRIEF_HOMEPAGE_CACHE_TAG, "max");
    revalidateTag(TOP_PRIORITY_CACHE_TAG, "max");
    revalidateTag(FEED_SLIM_INDEX_CACHE_TAG, "max");

    return NextResponse.json({ ok: true, topicId, pmid, setting });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
