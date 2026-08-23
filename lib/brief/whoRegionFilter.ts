import {
  ARTICLE_WHO_REGION_LABELS,
  ARTICLE_WHO_REGION_ORDER,
  classifyArticleWhoRegions,
  type WhoRegion,
} from "@/lib/classifyWhoRegion";
import type { BriefItem } from "@/lib/brief/items";

export type BriefWhoRegionFilter = "" | WhoRegion;

export const BRIEF_WHO_REGION_OPTIONS: {
  value: BriefWhoRegionFilter;
  label: string;
}[] = [
  { value: "", label: "All regions" },
  ...ARTICLE_WHO_REGION_ORDER.map((value) => ({
    value,
    label: ARTICLE_WHO_REGION_LABELS[value],
  })),
];

export function parseBriefWhoRegion(
  raw: string | undefined
): BriefWhoRegionFilter {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "afr" ||
    v === "amr" ||
    v === "sear" ||
    v === "eur" ||
    v === "emr" ||
    v === "wpr"
  ) {
    return v;
  }
  if (v === "africa" || v === "african") return "afr";
  if (v === "americas" || v === "america") return "amr";
  if (v === "searo" || v === "south-east-asia" || v === "southeast-asia") {
    return "sear";
  }
  if (v === "europe" || v === "euro") return "eur";
  if (v === "emro" || v === "eastern-mediterranean") return "emr";
  if (v === "wpro" || v === "western-pacific") return "wpr";
  return "";
}

function parseStoredWhoRegions(raw: string[] | null | undefined): WhoRegion[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const allowed = new Set<string>(ARTICLE_WHO_REGION_ORDER);
  const out: WhoRegion[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (allowed.has(s)) out.push(s as WhoRegion);
  }
  return out;
}

/**
 * Effective WHO regions: stored auto_who_regions when present (including
 * empty = classified none); else live classify from title + keywords + MeSH
 * + affiliations (+ abstract snippet when present).
 */
export function getItemWhoRegions(item: {
  whoRegions?: WhoRegion[] | null;
  autoWhoRegions?: WhoRegion[] | null;
  title?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
  affiliations?: string[] | null;
  abstractSnippet?: string | null;
}): WhoRegion[] {
  if (item.whoRegions && item.whoRegions.length > 0) return item.whoRegions;
  if (item.autoWhoRegions != null) {
    return parseStoredWhoRegions(item.autoWhoRegions);
  }
  return classifyArticleWhoRegions({
    title: item.title,
    abstract: item.abstractSnippet,
    keywords: item.keywords,
    meshTerms: item.meshTerms,
    affiliations: item.affiliations,
  });
}

export function matchesBriefWhoRegionFilter(
  item: BriefItem,
  filter: BriefWhoRegionFilter
): boolean {
  if (!filter) return true;
  return getItemWhoRegions(item).includes(filter);
}

export function whoRegionLabel(region: WhoRegion | null): string | null {
  if (!region) return null;
  return ARTICLE_WHO_REGION_LABELS[region] ?? region;
}
