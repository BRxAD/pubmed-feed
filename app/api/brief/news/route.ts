import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import { BRIEF_HOMEPAGE_CACHE_TAG } from "@/lib/brief/homepageCache";
import {
  ingestNewsFeeds,
  listNewsItems,
  setNewsItemStatus,
} from "@/lib/news/store";

export const runtime = "nodejs";
export const maxDuration = 60;

function secretFrom(request: NextRequest): string | null {
  return (
    request.headers.get("x-brief-admin-secret")?.trim() ||
    request.nextUrl.searchParams.get("secret")?.trim() ||
    null
  );
}

/** List pending/approved news; optional ?poll=1 to fetch feeds first. */
export async function GET(request: NextRequest) {
  if (!verifyBriefAdminSecret(secretFrom(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get("status") ?? "pending";
  const status =
    statusParam === "approved" ||
    statusParam === "rejected" ||
    statusParam === "all" ||
    statusParam === "pending"
      ? statusParam
      : "pending";

  const poll = request.nextUrl.searchParams.get("poll") === "1";
  let pollResult: Awaited<ReturnType<typeof ingestNewsFeeds>> | undefined;
  if (poll) {
    pollResult = await ingestNewsFeeds();
  }

  const items = await listNewsItems({ status, limit: 50 });
  return NextResponse.json({ ok: true, items, poll: pollResult });
}

/** Approve, reject, or reset a news item. */
export async function POST(request: NextRequest) {
  if (!verifyBriefAdminSecret(secretFrom(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  };
  const id = body.id?.trim();
  const status = body.status?.trim();
  if (!id || (status !== "approved" && status !== "rejected" && status !== "pending")) {
    return NextResponse.json(
      { ok: false, error: "id and status (approved|rejected|pending) required" },
      { status: 400 }
    );
  }

  try {
    const item = await setNewsItemStatus(id, status);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    try {
      revalidateTag(BRIEF_HOMEPAGE_CACHE_TAG, "max");
    } catch {
      // ignore outside request context
    }
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
