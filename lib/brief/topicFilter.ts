import {
  ARTICLE_TOPIC_LABELS,
  ARTICLE_TOPIC_ORDER,
  classifyArticleTopics,
  type ArticleTopic,
} from "@/lib/classifyTopic";
import type { BriefItem } from "@/lib/brief/items";

export type BriefTopicFilter = "" | ArticleTopic;

export const BRIEF_TOPIC_OPTIONS: {
  value: BriefTopicFilter;
  label: string;
}[] = [
  { value: "", label: "All topics" },
  ...ARTICLE_TOPIC_ORDER.map((value) => ({
    value,
    label: ARTICLE_TOPIC_LABELS[value],
  })),
];

export function parseBriefTopic(raw: string | undefined): BriefTopicFilter {
  const v = raw?.trim().toLowerCase() ?? "";
  if (
    v === "urinary" ||
    v === "respiratory" ||
    v === "skin-soft-tissue" ||
    v === "artificial-intelligence"
  ) {
    return v;
  }
  // Friendly aliases
  if (v === "ssti" || v === "skin") return "skin-soft-tissue";
  if (v === "ai") return "artificial-intelligence";
  return "";
}

function parseStoredTopics(raw: string[] | null | undefined): ArticleTopic[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const allowed = new Set<string>(ARTICLE_TOPIC_ORDER);
  const out: ArticleTopic[] = [];
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (allowed.has(s)) out.push(s as ArticleTopic);
  }
  return out;
}

/**
 * Effective topics for a Brief item: stored auto_topics when present
 * (including empty = classified none); else live classify from title +
 * keywords + MeSH (+ abstract snippet when present).
 */
export function getItemTopics(item: {
  topics?: ArticleTopic[] | null;
  autoTopics?: ArticleTopic[] | null;
  title?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
  abstractSnippet?: string | null;
}): ArticleTopic[] {
  if (item.topics && item.topics.length > 0) return item.topics;
  if (item.autoTopics != null) {
    return parseStoredTopics(item.autoTopics);
  }
  return classifyArticleTopics({
    title: item.title,
    abstract: item.abstractSnippet,
    keywords: item.keywords,
    meshTerms: item.meshTerms,
  });
}

export function matchesBriefTopicFilter(
  item: BriefItem,
  filter: BriefTopicFilter
): boolean {
  if (!filter) return true;
  return getItemTopics(item).includes(filter);
}

export function briefTopicLabel(topic: ArticleTopic | null): string | null {
  if (!topic) return null;
  return ARTICLE_TOPIC_LABELS[topic] ?? topic;
}

/** Build homepage href preserving setting + topic query params. */
export function briefHomeHref(opts: {
  setting?: string;
  topic?: string;
}): string {
  const q = new URLSearchParams();
  if (opts.setting) q.set("setting", opts.setting);
  if (opts.topic) q.set("topic", opts.topic);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
