import { NextResponse, type NextRequest } from "next/server";
import {
  loadAccountSavedArticles,
  pushAndLoadSavedArticles,
  sessionFromRequest,
  writeSavedArticle,
} from "@/lib/savedArticlesService";
import {
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — account saved list (source of truth when signed in). */
export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  const result = await loadAccountSavedArticles(session);
  return NextResponse.json(result, {
    status: result.error && result.items.length === 0 ? 401 : 200,
  });
}

type Body =
  | { action: "sync"; items?: SavedBriefItem[] }
  | {
      action: "toggle";
      pmid: string;
      title?: string | null;
      pubmedUrl?: string | null;
      saved: boolean;
    };

/**
 * POST — toggle one article, or migrate leftover local saves (additive upsert).
 * Clients must pull via GET on refresh; do not POST a full device list every time.
 */
export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "sync") {
    const incoming = Array.isArray(body.items)
      ? body.items
          .map((item) => sanitizeSavedItem(item))
          .filter((item): item is SavedBriefItem => Boolean(item))
      : [];
    const result = await pushAndLoadSavedArticles(incoming, session);
    return NextResponse.json(result, {
      status: result.error ? 401 : 200,
    });
  }

  if (body.action === "toggle") {
    const result = await writeSavedArticle(
      {
        pmid: body.pmid,
        title: body.title,
        pubmedUrl: body.pubmedUrl,
        saved: Boolean(body.saved),
      },
      session
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, items: [] as SavedBriefItem[] },
        { status: 401 }
      );
    }
    return NextResponse.json({ items: result.items });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
