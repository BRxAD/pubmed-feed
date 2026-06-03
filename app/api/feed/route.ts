import { NextRequest, NextResponse } from "next/server";
import { getFeedItems, type FeedSort } from "@/lib/feed";
import type { FeedFilterParams } from "@/lib/filters";
import { parseFeedSource } from "@/lib/feedSource";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const topicId = searchParams.get("topicId");
    const cursor = searchParams.get("cursor");
    const sortParam = searchParams.get("sort");
    const keyword = searchParams.get("keyword") ?? undefined;
    const pageParam = searchParams.get("page");

    if (!topicId || !topicId.trim()) {
      return NextResponse.json(
        { ok: false, error: "topicId is required" },
        { status: 400 }
      );
    }

    const sort: FeedSort =
      sortParam === "relevance" || sortParam === "recency"
        ? sortParam
        : "recency";

    const page =
      pageParam != null && pageParam !== ""
        ? Math.max(1, parseInt(pageParam, 10) || 1)
        : 1;

    const filters: FeedFilterParams = {
      keyword: keyword?.trim() || undefined,
    };

    const source = parseFeedSource(searchParams.get("source") ?? undefined);

    const result = await getFeedItems(
      topicId.trim(),
      10,
      cursor?.trim() ?? null,
      sort,
      filters,
      page,
      source
    );

    return NextResponse.json({
      ok: true,
      items: result.items,
      nextCursor: result.nextCursor,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      page: result.page,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isNotFound = message === "Topic not found";
    return NextResponse.json(
      { ok: false, error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
