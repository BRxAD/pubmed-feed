import type { PubMedRecord } from "@/lib/pubmed/efetch";
import {
  normalizeDoi,
  pmidFromOpenAlexIdField,
} from "@/lib/doi";

export type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]>;
  publication_date?: string;
  type?: string;
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null; type?: string | null };
  };
  best_oa_location?: { landing_page_url?: string | null } | null;
  concepts?: { display_name?: string; score?: number }[];
  ids?: { pmid?: string | null; doi?: string | null; openalex?: string | null };
  keywords?: { keyword?: string; display_name?: string }[];
  authorships?: {
    author?: { display_name?: string | null };
    institutions?: { display_name?: string | null }[];
  }[];
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
  if (t === "letter") return ["Letter"];
  if (t === "editorial") return ["Editorial"];
  return [type.trim()];
}

export type OpenAlexRecord = PubMedRecord & {
  doi: string | null;
  openalexId: string;
  landingUrl: string | null;
  pubmedPmid: string | null;
};

export function openAlexWorkToRecord(work: OpenAlexWork): OpenAlexRecord | null {
  const workId = openAlexIdFromUrl(work.id ?? work.ids?.openalex ?? undefined);
  if (!workId) return null;

  const type = work.type?.trim().toLowerCase() ?? "";
  if (type === "preprint") return null;
  if (type && type !== "article" && type !== "review") return null;

  const doi = normalizeDoi(work.doi ?? work.ids?.doi ?? null);
  if (!doi) return null;

  const pubmedPmid = pmidFromOpenAlexIdField(work.ids?.pmid ?? null);
  const rowId = pubmedPmid ?? workId;

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

  const authors: string[] = [];
  const affiliations: string[] = [];
  for (const a of work.authorships ?? []) {
    const name = a.author?.display_name?.trim();
    if (name) authors.push(name);
    for (const inst of a.institutions ?? []) {
      const instName = inst.display_name?.trim();
      if (instName) affiliations.push(instName);
    }
  }

  const landingUrl =
    work.primary_location?.landing_page_url?.trim() ||
    work.best_oa_location?.landing_page_url?.trim() ||
    `https://doi.org/${doi}`;

  return {
    pmid: rowId,
    title: work.display_name?.trim() ?? null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    journal,
    pubDate: work.publication_date?.trim() ?? null,
    publicationTypes: mapPublicationType(work.type),
    meshTerms: [],
    keywords: [...new Set(keywords)].slice(0, 25),
    authors: [...new Set(authors)].slice(0, 40),
    affiliations: [...new Set(affiliations)].slice(0, 40),
    doi,
    openalexId: workId,
    landingUrl,
    pubmedPmid,
  };
}
