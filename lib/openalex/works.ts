import type { PubMedRecord } from "@/lib/pubmed/efetch";

type OpenAlexWork = {
  id?: string;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]>;
  publication_date?: string;
  type?: string;
  primary_location?: {
    source?: { display_name?: string | null };
  };
  concepts?: { display_name?: string; score?: number }[];
  ids?: { pmid?: string | null; doi?: string | null };
  keywords?: { keyword?: string; display_name?: string }[];
};

export function openAlexIdFromUrl(id: string | undefined): string | null {
  if (!id?.trim()) return null;
  const trimmed = id.trim();
  const fromUrl = trimmed.match(/\/(W\d+)\/?$/i);
  if (fromUrl) return fromUrl[1].toUpperCase();
  if (/^W\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function reconstructAbstract(
  inverted: Record<string, number[]> | undefined
): string | null {
  if (!inverted || typeof inverted !== "object") return null;
  const positions: [number, string][] = [];
  for (const [word, idxs] of Object.entries(inverted)) {
    if (!Array.isArray(idxs)) continue;
    for (const i of idxs) {
      if (typeof i === "number") positions.push([i, word]);
    }
  }
  if (positions.length === 0) return null;
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map((p) => p[1]).join(" ").trim() || null;
}

function mapPublicationType(type: string | undefined): string[] {
  if (!type?.trim()) return [];
  const t = type.trim().toLowerCase();
  if (t === "article") return ["Journal Article"];
  if (t === "review") return ["Review"];
  if (t === "preprint") return ["Preprint"];
  return [type.trim()];
}

export function openAlexWorkToRecord(work: OpenAlexWork): PubMedRecord | null {
  const workId = openAlexIdFromUrl(work.id);
  if (!workId) return null;

  const pmid = workId;

  const keywords: string[] = [];
  for (const c of work.concepts ?? []) {
    const name = c?.display_name?.trim();
    if (name && (c.score == null || c.score >= 0.3)) keywords.push(name);
  }
  for (const k of work.keywords ?? []) {
    const name = (k.keyword ?? k.display_name)?.trim();
    if (name) keywords.push(name);
  }

  const journal =
    work.primary_location?.source?.display_name?.trim() ?? null;

  return {
    pmid,
    title: work.display_name?.trim() ?? null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    journal,
    pubDate: work.publication_date?.trim() ?? null,
    publicationTypes: mapPublicationType(work.type),
    meshTerms: [],
    keywords: [...new Set(keywords)].slice(0, 25),
    authors: [],
  };
}
