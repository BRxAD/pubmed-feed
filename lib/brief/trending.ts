import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  canonicalKeywordForGrouping,
  isTrendingBlocklisted,
  keywordDisplayForm,
} from "@/lib/filters";

export type TrendingTerm = {
  keyword: string;
  /** Mentions in the last 30 days */
  count: number;
  /** Mentions in the prior 30 days (days 31–60) */
  priorCount: number;
  /** Percent change vs prior window; null when the keyword is new in the recent window */
  deltaPercent: number | null;
  /** Absolute change in mentions (count − priorCount) */
  deltaAbsolute: number;
  /** Keyword absent from the prior 30-day window */
  isNew: boolean;
};

export async function getBriefTrendingTerms(
  topicId: string
): Promise<TrendingTerm[]> {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const { data: rows, error } = await supabase
    .from("summaries")
    .select("created_at, articles!inner(keywords, source)")
    .eq("topic_id", topicId)
    .eq("articles.source", "pubmed")
    .gte("created_at", sixtyDaysAgo.toISOString())
    .limit(10000);

  if (error) return [];

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  const since30 = thirtyDaysAgo.toISOString();

  for (const row of rows ?? []) {
    const created = String((row as { created_at?: string }).created_at ?? "");
    const keywords = (
      row as { articles?: { keywords?: string[] | null } }
    ).articles?.keywords;
    if (!Array.isArray(keywords)) continue;

    const bucket = created >= since30 ? recent : prior;

    for (const kw of keywords) {
      const k = (kw ?? "").trim();
      if (!k) continue;
      const canonical = canonicalKeywordForGrouping(k);
      if (isTrendingBlocklisted(canonical)) continue;
      bucket.set(canonical, (bucket.get(canonical) ?? 0) + 1);
    }
  }

  const terms: TrendingTerm[] = [];
  for (const [canonical, count] of recent) {
    const priorCount = prior.get(canonical) ?? 0;
    const deltaAbsolute = count - priorCount;
    const isNew = priorCount === 0 && count > 0;
    let deltaPercent: number | null = null;
    if (!isNew && priorCount > 0) {
      deltaPercent = Math.round((deltaAbsolute / priorCount) * 100);
    }

    terms.push({
      keyword: keywordDisplayForm(canonical),
      count,
      priorCount,
      deltaPercent,
      deltaAbsolute,
      isNew,
    });
  }

  return terms
    .filter((t) => t.deltaAbsolute > 0 && (t.isNew ? t.count >= 1 : true))
    .sort(
      (a, b) =>
        b.deltaAbsolute - a.deltaAbsolute ||
        b.count - a.count ||
        (b.deltaPercent ?? 0) - (a.deltaPercent ?? 0)
    )
    .slice(0, 10);
}

export function buildEditorsNote(
  items: { headline: string; setting: string | null }[],
  newSinceYesterday: number
): string {
  if (items.length === 0) {
    return "A quiet stretch in the stewardship literature — we will surface new PubMed studies as they are summarized.";
  }

  const settings = [
    ...new Set(items.map((i) => i.setting).filter(Boolean)),
  ] as string[];
  const settingPhrase =
    settings.length === 1
      ? `Today's brief leans ${settings[0]?.replace(/-/g, " ")}.`
      : settings.length > 1
        ? "Today's mix spans several care settings."
        : "";

  const newPhrase =
    newSinceYesterday > 0
      ? `${newSinceYesterday} new ${newSinceYesterday === 1 ? "study" : "studies"} since yesterday.`
      : "Curated from the week's highest-priority PubMed literature.";

  return [newPhrase, settingPhrase].filter(Boolean).join(" ");
}
