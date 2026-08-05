/**
 * Assess candidate features (keywords, MeSH, pub types, clinical flags,
 * setting, text heuristics) for separating rating >=5 and especially 4 vs 5.
 *
 *   npx tsx --tsconfig scripts/priority-eval/tsconfig.json \
 *     scripts/priority-eval/analyze-boundary-features.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { classifyArticleSetting } from "@/lib/classifySetting";
import { normalizeText } from "@/lib/ranking";

const OUT = "scripts/priority-eval/data/report-boundary-features.txt";
const CSV = "scripts/priority-eval/data/priority-dataset.csv";
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

function parseCsv(path: string): { pmid: string; rating: number }[] {
  const raw = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const header = raw[0].split(",");
  const pmidI = header.indexOf("pmid");
  const ratingI = header.indexOf("rating");
  const rows: { pmid: string; rating: number }[] = [];
  for (let i = 1; i < raw.length; i++) {
    // naive CSV: pmid is first col, rating second — both unquoted ints/strings
    const cols = raw[i].split(",");
    const pmid = cols[pmidI]?.trim();
    const rating = Number(cols[ratingI]);
    if (pmid && Number.isFinite(rating)) rows.push({ pmid, rating });
  }
  return rows;
}

type Art = {
  pmid: string;
  title: string | null;
  abstract: string | null;
  journal: string | null;
  keywords: string[] | null;
  mesh_terms: string[] | null;
  publication_types: string[] | null;
  subheading: string | null;
  label: string | null;
  admin_setting: string | null;
};

function canon(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

type LiftRow = {
  feature: string;
  n: number;
  rateAll: number;
  rateGe5: number;
  rateLt5: number;
  rate4: number;
  rate5: number;
  liftGe5: number;
  lift45: number; // P(feat|5) / P(feat|4) style: rate5 - rate4
  meanWhen: number;
  meanWithout: number;
};

function evaluateBinary(
  name: string,
  flags: boolean[],
  ratings: number[]
): LiftRow | null {
  const n = flags.length;
  const onIdx = flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (onIdx.length < 8) return null; // need enough support
  const rate = (pred: (r: number, i: number) => boolean) => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      if (!pred(ratings[i], i)) continue;
      den++;
      if (flags[i]) num++;
    }
    return den ? num / den : 0;
  };
  const mean = (wantOn: boolean) => {
    let s = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (flags[i] !== wantOn) continue;
      s += ratings[i];
      c++;
    }
    return c ? s / c : NaN;
  };
  const rateAll = onIdx.length / n;
  const rateGe5 = rate((r) => r >= 5);
  const rateLt5 = rate((r) => r < 5);
  const rate4 = rate((r) => r === 4);
  const rate5 = rate((r) => r === 5);
  return {
    feature: name,
    n: onIdx.length,
    rateAll,
    rateGe5,
    rateLt5,
    rate4,
    rate5,
    liftGe5: rateGe5 - rateLt5,
    lift45: rate5 - rate4,
    meanWhen: mean(true),
    meanWithout: mean(false),
  };
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );

  const rated = parseCsv(CSV);
  const ratingByPmid = new Map(rated.map((r) => [r.pmid, r.rating]));
  const pmids = [...ratingByPmid.keys()];
  console.log(`rated pmids from csv: ${pmids.length}`);

  const { data: topics } = await supabase.from("topics").select("id, name");
  const topic = (topics ?? []).find(
    (t) =>
      /antimicrobial stewardship/i.test(String(t.name)) &&
      !/artificial intelligence/i.test(String(t.name))
  );
  if (!topic) throw new Error("topic not found");

  const arts = new Map<string, Art>();
  for (let i = 0; i < pmids.length; i += 200) {
    const chunk = pmids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("summaries")
      .select(
        "pmid, subheading, label, admin_setting, articles!inner(title, abstract, journal, keywords, mesh_terms, publication_types)"
      )
      .eq("topic_id", topic.id)
      .in("pmid", chunk);
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      const row = raw as unknown as {
        pmid: string;
        subheading: string | null;
        label: string | null;
        admin_setting: string | null;
        articles: {
          title: string | null;
          abstract: string | null;
          journal: string | null;
          keywords: string[] | null;
          mesh_terms: string[] | null;
          publication_types: string[] | null;
        };
      };
      arts.set(row.pmid, {
        pmid: row.pmid,
        title: row.articles.title,
        abstract: row.articles.abstract,
        journal: row.articles.journal,
        keywords: row.articles.keywords,
        mesh_terms: row.articles.mesh_terms,
        publication_types: row.articles.publication_types,
        subheading: row.subheading,
        label: row.label,
        admin_setting: row.admin_setting,
      });
    }
  }
  console.log(`articles resolved: ${arts.size}`);

  // Align arrays
  const ordered = pmids.filter((p) => arts.has(p));
  const ratings = ordered.map((p) => ratingByPmid.get(p)!);
  const n4 = ratings.filter((r) => r === 4).length;
  const n5 = ratings.filter((r) => r === 5).length;
  const nGe5 = ratings.filter((r) => r >= 5).length;

  type FeatFn = (a: Art) => boolean;
  const candidates: { name: string; fn: FeatFn }[] = [];

  // Coverage / structure
  candidates.push({
    name: "has_any_keyword",
    fn: (a) => (a.keywords?.length ?? 0) > 0,
  });
  candidates.push({
    name: "has_any_mesh",
    fn: (a) => (a.mesh_terms?.length ?? 0) > 0,
  });
  candidates.push({
    name: "keyword_count>=5",
    fn: (a) => (a.keywords?.length ?? 0) >= 5,
  });
  candidates.push({
    name: "mesh_count>=5",
    fn: (a) => (a.mesh_terms?.length ?? 0) >= 5,
  });
  candidates.push({
    name: "abstract_words>=250",
    fn: (a) => (a.abstract?.trim().split(/\s+/).length ?? 0) >= 250,
  });
  candidates.push({
    name: "abstract_words<100",
    fn: (a) => {
      const w = a.abstract?.trim().split(/\s+/).filter(Boolean).length ?? 0;
      return w > 0 && w < 100;
    },
  });

  // Study type / label
  for (const lab of [
    "randomized controlled trial",
    "systematic review",
    "meta-analysis",
    "guideline",
    "observational",
    "cohort",
    "case report",
    "narrative review",
    "qualitative",
    "commentary",
  ]) {
    const needle = lab;
    candidates.push({
      name: `label~${lab}`,
      fn: (a) =>
        normalizeText(`${a.label ?? ""} ${a.subheading ?? ""}`).includes(
          normalizeText(needle)
        ),
    });
  }

  // Pub types
  for (const pt of [
    "randomized controlled trial",
    "systematic review",
    "meta-analysis",
    "practice guideline",
    "guideline",
    "review",
    "letter",
    "comment",
    "case reports",
    "clinical trial",
  ]) {
    candidates.push({
      name: `pubtype~${pt}`,
      fn: (a) =>
        (a.publication_types ?? []).some((p) =>
          normalizeText(p).includes(normalizeText(pt))
        ),
    });
  }

  // Setting
  for (const s of [
    "hospital",
    "community",
    "long-term care",
    "animal",
    "environment",
  ] as const) {
    candidates.push({
      name: `setting=${s}`,
      fn: (a) => {
        if (a.admin_setting === s) return true;
        const auto = classifyArticleSetting({
          title: a.title,
          abstract: a.abstract,
          keywords: a.keywords ?? [],
        });
        return auto === s;
      },
    });
  }

  // Text heuristics that often matter for ASP "would I brief this?"
  const textFlags: [string, RegExp][] = [
    ["text:stewardship_phrase", /\bantimicrobial stewardship\b|\bantibiotic stewardship\b/i],
    ["text:asp_acronym", /\bASP\b/],
    ["text:outcome_mortality", /\bmortality\b|\bdeath\b|\b30-?day\b/i],
    ["text:outcome_los", /\blength of stay\b|\bLOS\b|\breadmission/i],
    ["text:cdi", /\bClostridioides\b|\bC\.?\s*difficile\b|\bCDI\b/i],
    ["text:mdro", /\bMDRO\b|\bESBL\b|\bCRE\b|\bMRSA\b|\bVRE\b/i],
    ["text:prospective", /\bprospective\b/i],
    ["text:retrospective", /\bretrospective\b/i],
    ["text:interrupted_time", /\binterrupted time series\b|\bITS\b/i],
    ["text:before_after", /\bbefore[-\s]?and[-\s]?after\b|\bpre[-\s]?post\b/i],
    ["text:implementation", /\bimplementation\b|\bQI\b|\bquality improvement\b/i],
    ["text:audit_feedback", /\baudit(?:ing)? and feedback\b|\baudit[-\s]?feedback\b/i],
    ["text:de_escalation", /\bde-?escalat/i],
    ["text:duration", /\bduration of (?:therapy|treatment|antibiotic)/i],
    ["text:procalcitonin", /\bprocalcitonin\b|\bPCT\b/],
    ["text:pediatric", /\bpediatr|\bpaediatr|\bchildren\b|\bneonat/i],
    ["text:icu", /\bICU\b|\bintensive care\b/],
    ["text:outpatient", /\boutpatient\b|\bambulatory\b|\bcommunity pharmacy\b/i],
    ["text:pharmacokinetics", /\bpharmacokinetic|\bPK\/PD\b|\bMIC\b/i],
    ["text:genomics_wgs", /\bwhole[-\s]?genome\b|\bWGS\b|\bgenomic\b/i],
    ["text:in_vitro", /\bin vitro\b|\bin-vitro\b/i],
    ["text:animal_model", /\bmouse\b|\bmurine\b|\brat\b|\bporcine\b|\bin vivo\b/i],
    ["text:survey", /\bsurvey\b|\bquestionnaire\b|\bcross-sectional\b/i],
    ["text:cost", /\bcost[-\s]?effectiveness\b|\beconomic\b|\bbudget\b/i],
    ["text:education_only", /\beducation(?:al)? intervention\b|\btraining program\b/i],
  ];
  for (const [name, re] of textFlags) {
    candidates.push({
      name,
      fn: (a) => re.test(`${a.title ?? ""}\n${a.abstract ?? ""}`),
    });
  }

  // Top keywords / MeSH by frequency among rated, then measure lift
  const kwCounts = new Map<string, number>();
  const meshCounts = new Map<string, number>();
  for (const p of ordered) {
    const a = arts.get(p)!;
    for (const k of a.keywords ?? []) {
      const c = canon(k);
      if (c.length < 3) continue;
      kwCounts.set(c, (kwCounts.get(c) ?? 0) + 1);
    }
    for (const m of a.mesh_terms ?? []) {
      const c = canon(m);
      if (c.length < 3) continue;
      meshCounts.set(c, (meshCounts.get(c) ?? 0) + 1);
    }
  }
  const topKw = [...kwCounts.entries()]
    .filter(([, c]) => c >= 12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);
  const topMesh = [...meshCounts.entries()]
    .filter(([, c]) => c >= 12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);

  for (const [term] of topKw) {
    candidates.push({
      name: `kw:${term}`,
      fn: (a) => (a.keywords ?? []).some((k) => canon(k) === term),
    });
  }
  for (const [term] of topMesh) {
    candidates.push({
      name: `mesh:${term}`,
      fn: (a) => (a.mesh_terms ?? []).some((m) => canon(m) === term),
    });
  }

  // Existing clinical flags from CSV for comparison (v2)
  const csvRaw = readFileSync(CSV, "utf8").trim().split(/\r?\n/);
  const hdr = csvRaw[0].split(",");
  const flagCols = hdr.filter((h) => h.startsWith("v2__flag__"));
  const pmidCol = hdr.indexOf("pmid");
  const csvByPmid = new Map<string, string[]>();
  for (let i = 1; i < csvRaw.length; i++) {
    const cols = csvRaw[i].split(",");
    csvByPmid.set(cols[pmidCol], cols);
  }
  for (const col of flagCols) {
    const j = hdr.indexOf(col);
    candidates.push({
      name: `existing:${col.replace("v2__flag__", "")}`,
      fn: (a) => {
        const cols = csvByPmid.get(a.pmid);
        if (!cols) return false;
        return Number(cols[j]) === 1 || cols[j] === "true";
      },
    });
  }
  // current model continuous features as high/low
  for (const feat of [
    "stewardshipTitle",
    "clinicalBonusNorm",
    "keywordCountNorm",
  ]) {
    const j = hdr.indexOf(`v2__${feat}`);
    const vals = ordered.map((p) => Number(csvByPmid.get(p)?.[j] ?? 0));
    const med = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    candidates.push({
      name: `existing:${feat}>median`,
      fn: (a) => {
        const v = Number(csvByPmid.get(a.pmid)?.[j] ?? 0);
        return v > med;
      },
    });
  }

  const lifts: LiftRow[] = [];
  for (const c of candidates) {
    const flags = ordered.map((p) => c.fn(arts.get(p)!));
    const row = evaluateBinary(c.name, flags, ratings);
    if (row) lifts.push(row);
  }

  const by45 = [...lifts].sort(
    (a, b) => Math.abs(b.lift45) - Math.abs(a.lift45)
  );
  const byGe5 = [...lifts].sort(
    (a, b) => Math.abs(b.liftGe5) - Math.abs(a.liftGe5)
  );
  const pos45 = by45.filter((r) => r.lift45 > 0.04 && r.n >= 15).slice(0, 40);
  const neg45 = by45.filter((r) => r.lift45 < -0.04 && r.n >= 15).slice(0, 25);
  const posGe5 = byGe5.filter((r) => r.liftGe5 > 0.05 && r.n >= 15).slice(0, 40);

  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("=".repeat(78));
  w("BOUNDARY FEATURE ASSESSMENT — rating 4 vs 5 and >=5");
  w("=".repeat(78));
  w("");
  w(`Articles with text: ${ordered.length} / ${pmids.length}`);
  w(`n(rating=4)=${n4}  n(rating=5)=${n5}  n(>=5)=${nGe5}`);
  w(`Keyword vocab (>=12 docs): ${topKw.length}`);
  w(`MeSH vocab (>=12 docs): ${topMesh.length}`);
  w("");
  w("How to read:");
  w("  lift45 = P(feature | rating=5) - P(feature | rating=4)");
  w("  liftGe5 = P(feature | >=5) - P(feature | <5)");
  w("  Positive lift45 => more common among 5s than 4s (helps the hard cut).");
  w("");

  const fmt = (r: LiftRow) =>
    `${r.feature.padEnd(42)} n=${String(r.n).padStart(3)}  ` +
    `p4=${r.rate4.toFixed(2)} p5=${r.rate5.toFixed(2)} ` +
    `d45=${(r.lift45 >= 0 ? "+" : "") + r.lift45.toFixed(2)}  ` +
    `d>=5=${(r.liftGe5 >= 0 ? "+" : "") + r.liftGe5.toFixed(2)}  ` +
    `mean ${r.meanWhen.toFixed(2)} vs ${r.meanWithout.toFixed(2)}`;

  w("TOP POSITIVE for 5 vs 4 (hard Brief boundary)");
  w("-".repeat(78));
  for (const r of pos45) w(fmt(r));
  w("");
  w("TOP NEGATIVE for 5 vs 4 (marks 'looks relevant but skip')");
  w("-".repeat(78));
  for (const r of neg45) w(fmt(r));
  w("");
  w("TOP POSITIVE for >=5 vs <5 (overall Brief filter)");
  w("-".repeat(78));
  for (const r of posGe5) w(fmt(r));
  w("");

  // Coverage stats
  const kwCov = ordered.filter(
    (p) => (arts.get(p)!.keywords?.length ?? 0) > 0
  ).length;
  const meshCov = ordered.filter(
    (p) => (arts.get(p)!.mesh_terms?.length ?? 0) > 0
  ).length;
  w("COVERAGE");
  w("-".repeat(78));
  w(
    `keywords present: ${kwCov}/${ordered.length} (${((100 * kwCov) / ordered.length).toFixed(0)}%)`
  );
  w(
    `MeSH present:     ${meshCov}/${ordered.length} (${((100 * meshCov) / ordered.length).toFixed(0)}%)`
  );
  w("");

  // Simple recommendation block from rules
  w("RECOMMENDATIONS (data-driven)");
  w("-".repeat(78));
  const recommend = [...pos45, ...neg45]
    .filter(
      (r) =>
        !r.feature.startsWith("existing:") ||
        r.feature.includes("Non-human") ||
        r.feature.includes("Guideline") ||
        r.feature.includes("Intervention")
    )
    .slice(0, 20);
  if (!recommend.length) w("(see tables above)");
  for (const r of recommend.slice(0, 15)) {
    const dir = r.lift45 > 0 ? "UP toward 5" : "DOWN (more like 4/skip)";
    w(`- ${r.feature}: ${dir} (d45=${r.lift45 >= 0 ? "+" : ""}${r.lift45.toFixed(2)}, n=${r.n})`);
  }

  const text = lines.join("\n") + "\n";
  mkdirSync("scripts/priority-eval/data", { recursive: true });
  writeFileSync(OUT, text, "utf8");
  console.log(text);
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
