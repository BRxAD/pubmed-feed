import { NextRequest, NextResponse } from "next/server";
import { getTrendingKeywords } from "@/lib/feed";

export async function GET(request: NextRequest) {
  try {
    const topicId = request.nextUrl.searchParams.get("topicId");
    if (!topicId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "topicId is required" },
        { status: 400 }
      );
    }
    const keywords = await getTrendingKeywords(topicId.trim());
    return NextResponse.json({ ok: true, keywords });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
