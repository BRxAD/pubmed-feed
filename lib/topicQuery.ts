import { pubmedQueryToOpenAlex } from "@/lib/openalex/query";

export type TopicRow = {
  id: string;
  name: string;
  query_string: string;
  openalex_query_string?: string | null;
  ranking_weights?: Record<string, unknown> | null;
};

export function getPubMedQuery(topic: TopicRow): string {
  return topic.query_string?.trim() ?? "";
}

/** OpenAlex full-text search string for a topic. */
export function getOpenAlexSearch(topic: TopicRow): string {
  const dedicated = topic.openalex_query_string?.trim();
  if (dedicated) return dedicated;
  return pubmedQueryToOpenAlex(getPubMedQuery(topic));
}

/** Whether PubMed-style NOT clause excludes case reports / animal-only studies. */
export function topicExcludesClinicalNoise(pubmedQuery: string): boolean {
  const q = pubmedQuery.toLowerCase();
  return q.includes("case reports") || q.includes("animals[mesh]");
}
