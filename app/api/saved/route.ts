import { NextResponse } from "next/server";
import {
  loadAccountSavedArticles,
  pushAndLoadSavedArticles,
  writeSavedArticle,
} from "@/lib/savedArticlesService";
import {
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — account saved list (source of truth when signed in). */
export async function GET() {
  const result = await loadAccountSavedArticles();
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

/** POST — sync device saves into the account, or toggle one article. */
export async function POST(request: Request) {
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
    const result = await pushAndLoadSavedArticles(incoming);
    return NextResponse.json(result, {
      status: result.error && result.items.length === 0 ? 400 : 200,
    });
  }

  if (body.action === "toggle") {
    const result = await writeSavedArticle({
      pmid: body.pmid,
      title: body.title,
      pubmedUrl: body.pubmedUrl,
      saved: Boolean(body.saved),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, items: [] as SavedBriefItem[] },
        { status: 400 }
      );
    }
    return NextResponse.json({ items: result.items });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
