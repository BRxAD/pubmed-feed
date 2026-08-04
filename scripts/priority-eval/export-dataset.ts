/**
 * Export every human-rated article with priority features computed under both
 * clinical term sets (v1 = current production, v2 = expanded vocabulary).
 *
 * Features come from the real production code path so the analysis cannot
 * drift from what the app actually scores.
 *
 *   npx tsx --tsconfig scripts/priority-eval/tsconfig.json \
 *     scripts/priority-eval/export-dataset.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeBreakdown, type ScoringOptions } from "@/lib/ranking";
import {
  mergeFeedSettings,
  toRankingWeights,
  toPenaltyWeights,
} from "@/lib/brief/feedSettings";
import {
  extractPriorityFeatures,
  PRIORITY_FEATURE_NAMES,
} from "@/lib/brief/priorityFeatures";
import { fallbackPredictedPriority } from "@/lib/brief/priorityModel";
import { normalizeScoreTo100 } from "@/lib/filters";
import { isHighImpactJournal, lookupJif } from "@/lib/jif";
import { isQ1Journal, lookupScimago } from "@/lib/scimago";
import type { PubMedRecord } from "@/lib/pubmed/efetch";
import type { ClinicalTermSetVersion } from "@/lib/brief/clinicalTerms";

const OUT_DIR = "scripts/priority-eval/data";
const PAGE = 1000;

function loadEnv(): Record<string, string> {
  const raw = readFileSync(".env.local", "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const supabase = createClient(
  env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type FeedbackRow = { pmid: string; admin_priority: number; created_at: string };

async function fetchAllFeedback(topicId: string): Promise<FeedbackRow[]> {
  const rows: FeedbackRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("relevance_feedback")
      .select("pmid, admin_priority, created_at")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as FeedbackRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

type ArticleRow = {
  pmid: string;
  admin_priority: number | null;
  articles: {
    title: string | null;
    abstract: string | null;
    journal: string | null;
    pub_date: string | null;
    release_date: string | null;
    publication_types: string[] | null;
    keywords: string[] | null;
    mesh_terms: string[] | null;
  } | null;
};

async function fetchArticles(
  topicId: string,
  pmids: string[]
): Promise<Map<string, ArticleRow>> {
  const byPmid = new Map<string, ArticleRow>();
  const CHUNK = 200;
  for (let i = 0; i < pmids.length; i += CHUNK) {
    const chunk = pmids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, admin_priority, articles!inner(title, abstract, journal, pub_date, release_date, publication_types, keywords, mesh_terms)"
      )
      .eq("topic_id", topicId)
      .in("pmid", chunk);
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      const row = raw as unknown as ArticleRow;
      if (row.articles?.title?.trim()) byPmid.set(row.pmid, row);
    }
  }
  return byPmid;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { data: topics, error: topicErr } = await supabase
    .from("topics")
    .select("id, name, query_string, ranking_weights");
  if (topicErr) throw new Error(topicErr.message);

  const topic = (topics ?? []).find(
    (t) =>
      /antimicrobial stewardship/i.test(String(t.name)) &&
      !/artificial intelligence/i.test(String(t.name))
  );
  if (!topic) throw new Error("Default topic not found");

  console.log(`topic: ${topic.name} (${String(topic.id).slice(0, 8)})`);

  const settings = mergeFeedSettings(
    topic.ranking_weights as Record<string, unknown> | null
  );
  const weights = toRankingWeights(settings);
  const queryString = String(topic.query_string ?? "").trim();
  const basePenalties = toPenaltyWeights(settings);

  const feedback = await fetchAllFeedback(String(topic.id));
  console.log(`relevance_feedback rows: ${feedback.length}`);

  // Newest rating wins, matching relearnPriorityModel.
  const latest = new Map<string, FeedbackRow>();
  const allByPmid = new Map<string, number[]>();
  for (const row of feedback) {
    if (!row.pmid || row.admin_priority == null) continue;
    if (!latest.has(row.pmid)) latest.set(row.pmid, row);
    const list = allByPmid.get(row.pmid) ?? [];
    list.push(row.admin_priority);
    allByPmid.set(row.pmid, list);
  }
  console.log(`unique rated pmids: ${latest.size}`);

  const repeats = [...allByPmid.values()].filter((v) => v.length > 1);
  if (repeats.length) {
    const spreads = repeats.map((v) => Math.max(...v) - Math.min(...v));
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const exact = spreads.filter((s) => s === 0).length;
    console.log(
      `re-rated pmids: ${repeats.length}; mean spread ${mean.toFixed(2)}; identical ${exact}/${repeats.length}`
    );
  } else {
    console.log("re-rated pmids: 0 (no self-consistency signal available)");
  }

  const pmids = [...latest.keys()];
  const articles = await fetchArticles(String(topic.id), pmids);
  console.log(`articles resolved: ${articles.size}/${pmids.length}`);

  const versions: ClinicalTermSetVersion[] = ["v1", "v2"];
  const flagLabels = [
    "Q1 journal",
    "RCT",
    "Systematic review",
    "Multicenter",
    "Clinical stewardship",
    "Novelty",
    "Cohort",
    "Intervention",
    "Guideline",
    "Non-human only",
  ];

  const header = [
    "pmid",
    "rating",
    "rated_at",
    "n_ratings",
    "pub_date",
    "journal",
    "jif",
    "is_q1",
    "abstract_words",
  ];
  for (const v of versions) {
    for (const f of PRIORITY_FEATURE_NAMES) header.push(`${v}__${f}`);
    for (const label of flagLabels) {
      header.push(`${v}__flag__${label.replace(/\s+/g, "_")}`);
    }
    header.push(`${v}__relevance_pct`);
    header.push(`${v}__penalty_factor`);
    header.push(`${v}__fallback_priority`);
  }

  const lines: string[] = [header.join(",")];
  let skipped = 0;

  for (const pmid of pmids) {
    const row = articles.get(pmid);
    const fb = latest.get(pmid)!;
    if (!row?.articles) {
      skipped++;
      continue;
    }
    const a = row.articles;
    const rec: PubMedRecord = {
      pmid,
      title: a.title,
      abstract: a.abstract ?? null,
      journal: a.journal ?? null,
      pubDate: a.pub_date ?? null,
      publicationTypes: a.publication_types ?? [],
      meshTerms: a.mesh_terms ?? [],
      keywords: a.keywords ?? [],
      authors: [],
    };

    const jifIsHigh = isQ1Journal(rec.journal) || isHighImpactJournal(rec.journal);
    const scimago = lookupScimago(rec.journal);
    const abstractWords = (a.abstract ?? "").trim()
      ? (a.abstract ?? "").trim().split(/\s+/).length
      : 0;

    const cells: unknown[] = [
      pmid,
      fb.admin_priority,
      fb.created_at,
      allByPmid.get(pmid)?.length ?? 1,
      a.release_date ?? a.pub_date ?? "",
      a.journal ?? "",
      lookupJif(rec.journal)?.jif ?? "",
      jifIsHigh || Boolean(scimago) ? 1 : 0,
      abstractWords,
    ];

    for (const version of versions) {
      const scoringOptions: ScoringOptions = {
        ...basePenalties,
        smallSampleMax: settings.brief.smallSampleMax,
        largeStudyThreshold: settings.brief.largeStudyThreshold,
        clinicalTermSet: version,
      };
      const breakdown = computeBreakdown(
        queryString,
        rec,
        weights,
        true,
        jifIsHigh,
        scoringOptions
      );
      const features = extractPriorityFeatures(rec, breakdown);
      cells.push(...features);

      const present = new Set(breakdown.clinicalDetails.map((d) => d.label));
      for (const label of flagLabels) cells.push(present.has(label) ? 1 : 0);

      cells.push(normalizeScoreTo100(breakdown.finalScore));
      cells.push(breakdown.penaltyFactor.toFixed(4));
      cells.push(fallbackPredictedPriority(features));
    }

    lines.push(cells.map(csvEscape).join(","));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = `${OUT_DIR}/priority-dataset.csv`;
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(
    `wrote ${lines.length - 1} rows to ${outPath} (skipped ${skipped} without article rows)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
