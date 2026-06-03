import type { FeedItem } from "@/lib/feed";
import {
  classifyArticleSetting,
  type ArticleSetting,
} from "@/lib/classifySetting";

export type { ArticleSetting };

export type FeedFilterParams = {
  keyword?: string | null;
  minRelevance?: number | null;
  setting?: ArticleSetting | null;
};

/**
 * Normalize a rank score to 0–100 for display.
 * Calibrated against new max ≈ 210:
 *   stewardshipTitle(60) + abstract(15) + largeStudy(20) = 95 base
 *   × studyBoost max(1.75) × jifBoost(1.20) ≈ 198
 */
export function normalizeScoreTo100(score: number): number {
  if (typeof score !== "number" || Number.isNaN(score) || score <= 0) return 0;
  const capped = Math.min(100, (score / 210) * 100);
  return Math.round(Math.max(0, capped));
}

/** Display study label / subheading with underscores replaced by spaces. Returns "" for "Unclear". */
export function formatStudyLabel(s: string | null | undefined): string {
  if (s == null || typeof s !== "string") return "";
  const t = s.trim().replace(/_/g, " ");
  if (t.toLowerCase() === "unclear") return "";
  return t;
}

/** Simple string hash for consistent keyword color. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const KEYWORD_COLOR_CLASSES = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200",
] as const;

const STEWARDSHIP_CANONICAL = "antimicrobial stewardship";

/**
 * Keywords too broad / obvious to show in the trending sidebar.
 * Applied after canonicalization; kept for article matching.
 */
const TRENDING_BLOCKLIST = new Set([
  "antibiotic",
  "antibiotics",
  "antimicrobial",
  "antimicrobials",
  "antimicrobial stewardship",
  "antibiotic stewardship",
  "antibiotic resistance",
  "antimicrobial resistance",
  "antimicrobial resistance (amr)",
  "amr",
  "antimicrobial use",
  "stewardship",
  "antibiotic use",
  "antibiotic therapy",
  "antimicrobial therapy",
  "drug resistance",
  "drug resistance microbial",
  "drug resistance bacterial",
  "anti-bacterial agents",
  "anti-infective agents",
]);

export function isTrendingBlocklisted(canonical: string): boolean {
  return TRENDING_BLOCKLIST.has(canonical.trim().toLowerCase());
}

/** Normalize for grouping/counting: lowercase, and treat antibiotic/antimicrobial stewardship as one. */
export function canonicalKeywordForGrouping(kw: string): string {
  const k = (kw ?? "").trim().toLowerCase();
  if (!k) return k;
  if (k === "antibiotic stewardship") return STEWARDSHIP_CANONICAL;
  return k;
}

/** Display form for a canonical keyword (e.g. "Antimicrobial stewardship"). */
export function keywordDisplayForm(canonical: string): string {
  const c = (canonical ?? "").trim().toLowerCase();
  if (!c) return "";
  if (c === STEWARDSHIP_CANONICAL) return "Antimicrobial stewardship";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Tailwind classes for a keyword chip (consistent color per keyword). */
export function keywordColorClasses(keyword: string): string {
  const idx = hashString(keyword.trim() || "x") % KEYWORD_COLOR_CLASSES.length;
  return KEYWORD_COLOR_CLASSES[idx];
}

/**
 * Return the Tailwind left-border accent class for a study card based on study type.
 * Uses publication types first, then label/subheading.
 */
export function studyAccentClass(
  pubTypes: string[] | null | undefined,
  label: string | null | undefined,
  subheading: string | null | undefined
): string {
  const types = (pubTypes ?? []).map((s) => s.toLowerCase()).join(" ");
  const labelStr = [label, subheading].filter(Boolean).join(" ").toLowerCase();
  const combined = types + " " + labelStr;

  if (
    combined.includes("randomized") ||
    combined.includes("randomised") ||
    combined.includes("rct") ||
    combined.includes("controlled trial")
  ) {
    return "border-l-teal-400 dark:border-l-teal-500";
  }
  if (
    combined.includes("meta-analysis") ||
    combined.includes("meta analysis") ||
    combined.includes("systematic review")
  ) {
    return "border-l-purple-400 dark:border-l-purple-500";
  }
  if (
    combined.includes("retrospective") ||
    combined.includes("cohort") ||
    combined.includes("observational") ||
    combined.includes("case-control")
  ) {
    return "border-l-amber-400 dark:border-l-amber-500";
  }
  if (combined.includes("prospective") || combined.includes("clinical trial")) {
    return "border-l-blue-400 dark:border-l-blue-500";
  }
  return "border-l-zinc-400 dark:border-l-zinc-600";
}

export type SummaryBullets = {
  /** Background / context (new: [WHAT IS KNOWN], legacy: [WHAT]) */
  whatIsKnown: string | null;
  /** Study methods / design (new: [METHODS]; absent for opinion/editorial) */
  methods: string | null;
  /** Key findings with numbers (new + legacy: [RESULTS] / [FOUND]) */
  results: string | null;
  /** Practical clinical takeaway (new: [BOTTOM LINE], legacy: [SO WHAT]) */
  bottomLine: string | null;
};

/**
 * Parse structured clinical summary bullets.
 * Supports both the new 4-section format and the legacy 3-bullet format.
 * Returns null when no recognised sections are found.
 */
export function parseSummaryBullets(
  summary: string | null | undefined
): SummaryBullets | null {
  if (!summary?.trim()) return null;

  const lines = summary
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let whatIsKnown: string | null = null;
  let methods: string | null = null;
  let results: string | null = null;
  let bottomLine: string | null = null;

  for (const line of lines) {
    const stripped = line.replace(/^[-•*]\s*/, "");

    if (/^\[WHAT IS KNOWN\]/i.test(stripped)) {
      whatIsKnown = stripped.replace(/^\[WHAT IS KNOWN\]\s*/i, "").trim() || null;
    } else if (/^\[WHAT\]/i.test(stripped)) {
      // Legacy label — treat as background context
      whatIsKnown = stripped.replace(/^\[WHAT\]\s*/i, "").trim() || null;
    } else if (/^\[METHODS?\]/i.test(stripped)) {
      methods = stripped.replace(/^\[METHODS?\]\s*/i, "").trim() || null;
    } else if (/^\[RESULTS?\]/i.test(stripped)) {
      results = stripped.replace(/^\[RESULTS?\]\s*/i, "").trim() || null;
    } else if (/^\[FOUND\]/i.test(stripped)) {
      // Legacy label
      results = stripped.replace(/^\[FOUND\]\s*/i, "").trim() || null;
    } else if (/^\[BOTTOM LINE\]/i.test(stripped)) {
      bottomLine = stripped.replace(/^\[BOTTOM LINE\]\s*/i, "").trim() || null;
    } else if (/^\[SO WHAT\]/i.test(stripped)) {
      // Legacy label
      bottomLine = stripped.replace(/^\[SO WHAT\]\s*/i, "").trim() || null;
    }
  }

  if (!whatIsKnown && !methods && !results && !bottomLine) return null;
  return { whatIsKnown, methods, results, bottomLine };
}

function matchesKeyword(item: FeedItem, keyword: string): boolean {
  const canonical = canonicalKeywordForGrouping(keyword);
  if (!canonical) return true;
  const title = (item.articles?.title ?? "").toLowerCase();
  const abstract = (item.articles?.abstract ?? "").toLowerCase();
  const summary = (item.summary_text ?? "").toLowerCase();
  const labels = [item.label, item.subheading].filter(Boolean).join(" ").toLowerCase();
  const keywords = (item.articles?.keywords ?? []).join(" ").toLowerCase();
  const searchable = [title, abstract, summary, labels, keywords].join(" ");
  if (canonical === STEWARDSHIP_CANONICAL) {
    return (
      searchable.includes("antimicrobial stewardship") ||
      searchable.includes("antibiotic stewardship")
    );
  }
  return searchable.includes(canonical);
}

/**
 * Classify the setting for a feed item using deterministic term scoring.
 * Exposed so feed pages can compute it once and reuse for display + filtering.
 */
export function getItemSetting(item: FeedItem): ArticleSetting | null {
  return classifyArticleSetting({
    title: item.articles?.title,
    abstract: item.articles?.abstract,
    keywords: item.articles?.keywords ?? [],
  });
}

/**
 * Apply filter params to a list of feed items (in-memory filter).
 */
export function applyFiltersToFeedItems(
  items: FeedItem[],
  params: FeedFilterParams
): FeedItem[] {
  let out = items;
  if (params.keyword?.trim()) {
    out = out.filter((item) => matchesKeyword(item, params.keyword!));
  }
  if (params.setting) {
    const target = params.setting;
    out = out.filter((item) => getItemSetting(item) === target);
  }
  return out;
}
