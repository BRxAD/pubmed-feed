import { XMLParser } from "fast-xml-parser";

export type PubMedRecord = {
  pmid: string;
  title: string | null;
  abstract: string | null;
  journal: string | null;
  /** Journal issue date (for display) */
  pubDate: string | null;
  /** ArticleDate from the article record (electronic or print pub date) */
  articleDate?: string | null;
  /** epublish date from PubMedData/History */
  epubDate?: string | null;
  /** pubmed entry date from PubMedData/History */
  pubmedDate?: string | null;
  publicationTypes: string[];
  meshTerms: string[];
  keywords: string[];
  authors: string[];
};

const EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

function textVal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && !Number.isNaN(v)) return String(v).trim() || null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const t = o["#text"] ?? o["_"];
    if (typeof t === "string") return t.trim() || null;
    if (typeof t === "number" && !Number.isNaN(t)) return String(t).trim() || null;
  }
  return null;
}

function toArray<T>(v: unknown, map: (x: unknown) => T): T[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(map).filter(Boolean);
  const m = map(v);
  return m != null ? [m] : [];
}

function extractArticle(article: unknown): Partial<PubMedRecord> {
  const a = (article ?? {}) as Record<string, unknown>;

  const title = textVal(a.ArticleTitle) ?? null;

  const abstractObj = a.Abstract;
  let abstract: string | null = null;
  if (abstractObj != null) {
    const texts = toArray(
      (abstractObj as Record<string, unknown>).AbstractText,
      (x) => textVal(x)
    ).filter((s): s is string => s != null);
    abstract = texts.length > 0 ? texts.join("\n\n") : null;
  }

  const journalObj = a.Journal as Record<string, unknown> | undefined;
  const journal = journalObj ? textVal(journalObj.Title) ?? null : null;

  const issue = journalObj?.JournalIssue as Record<string, unknown> | undefined;
  const pubDateObj = issue?.PubDate as Record<string, unknown> | undefined;
  let pubDate: string | null = null;
  if (pubDateObj) {
    const y = textVal(pubDateObj.Year);
    const m = textVal(pubDateObj.Month);
    const d = textVal(pubDateObj.Day);
    const medline = textVal(pubDateObj.MedlineDate);
    if (y && m && d) pubDate = `${y} ${m} ${d}`;
    else if (y && m) pubDate = `${y} ${m}`;
    else if (y) pubDate = y;
    else if (medline) pubDate = medline;
  }

  const pubTypes = toArray(
    (a.PublicationTypeList as Record<string, unknown>)?.PublicationType,
    (x) => textVal(x)
  ).filter((s): s is string => s != null);

  // ArticleDate — the article's own electronic/print publication date
  // fast-xml-parser may return a single object or an array if multiple dates
  let articleDate: string | null = null;
  const articleDateRaw = a.ArticleDate;
  const articleDates = Array.isArray(articleDateRaw)
    ? articleDateRaw
    : articleDateRaw != null
    ? [articleDateRaw]
    : [];
  for (const ad of articleDates) {
    const d = ad as Record<string, unknown>;
    const y = textVal(d.Year);
    const m = textVal(d.Month);
    const day = textVal(d.Day);
    if (y && m && day) {
      articleDate = `${y} ${m} ${day}`;
      break;
    } else if (y && m) {
      articleDate = `${y} ${m}`;
      break;
    } else if (y) {
      articleDate = y;
      break;
    }
  }

  return { title, abstract, journal, pubDate, articleDate, publicationTypes: pubTypes };
}

/**
 * Extract epublish and pubmed entry dates from PubmedData/History.
 * Returns { epubDate, pubmedDate } — both may be null.
 */
function extractHistoryDates(pubmedData: unknown): {
  epubDate: string | null;
  pubmedDate: string | null;
} {
  const data = (pubmedData ?? {}) as Record<string, unknown>;
  const history = data.History as Record<string, unknown> | undefined;
  if (!history) return { epubDate: null, pubmedDate: null };

  const pubMedPubDates = toArray(history.PubMedPubDate, (x) => x);

  let epubDate: string | null = null;
  let pubmedDate: string | null = null;

  for (const entry of pubMedPubDates) {
    const e = entry as Record<string, unknown>;
    const status =
      textVal((e as Record<string, unknown>)["@_PubStatus"]) ??
      textVal((e as Record<string, unknown>)["PubStatus"]);
    const y = textVal(e.Year);
    const m = textVal(e.Month);
    const d = textVal(e.Day);
    const dateStr =
      y && m && d ? `${y} ${m} ${d}` : y && m ? `${y} ${m}` : y ?? null;
    if (!dateStr) continue;

    if (status === "epublish" && !epubDate) epubDate = dateStr;
    if (status === "pubmed" && !pubmedDate) pubmedDate = dateStr;
  }

  return { epubDate, pubmedDate };
}

function extractAuthors(authorList: unknown): string[] {
  const authors = toArray(
    (authorList as Record<string, unknown>)?.Author,
    (auth) => {
      const x = auth as Record<string, unknown>;
      const last = textVal(x.LastName);
      const initials = textVal(x.Initials) ?? textVal(x.ForeName);
      if (!last) return null;
      return initials ? `${last} ${initials}` : last;
    }
  ).filter((s): s is string => s != null);
  return authors;
}

function extractMeshTerms(meshList: unknown): string[] {
  const headings = toArray(
    (meshList as Record<string, unknown>)?.MeshHeading,
    (h) => textVal((h as Record<string, unknown>).DescriptorName)
  ).filter((s): s is string => s != null);
  return headings;
}

function extractKeywords(kwList: unknown): string[] {
  return toArray(
    (kwList as Record<string, unknown>)?.Keyword,
    (x) => textVal(x)
  ).filter((s): s is string => s != null);
}

/** Chunk size to avoid "URI too long" (IDs in query string). */
const EFETCH_CHUNK_SIZE = 100;
/** Timeout per request to avoid und_err_headers_timeout (NCBI can be slow). */
const EFETCH_REQUEST_MS = 90_000;
/** Delay between chunk requests to avoid overwhelming NCBI. */
const EFETCH_CHUNK_DELAY_MS = 11_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOneChunk(pmids: string[]): Promise<PubMedRecord[]> {
  if (pmids.length === 0) return [];

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
  });

  const tool = process.env.NCBI_TOOL;
  const email = process.env.NCBI_EMAIL;
  const apiKey = process.env.NCBI_API_KEY;
  if (tool) params.set("tool", tool);
  if (email) params.set("email", email);
  if (apiKey) params.set("api_key", apiKey);

  const url = `${EFETCH_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EFETCH_REQUEST_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`PubMed EFetch request failed: ${msg}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(
      `PubMed EFetch HTTP error: ${res.status} ${res.statusText}`
    );
  }

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new Error("PubMed EFetch: malformed XML response");
  }

  const root = parsed as Record<string, unknown>;
  const articleSet = root?.PubmedArticleSet as Record<string, unknown> | undefined;
  if (!articleSet) {
    throw new Error("PubMed EFetch: missing PubmedArticleSet");
  }

  const articles = toArray(articleSet.PubmedArticle, (x) => x);

  function getPmid(art: Record<string, unknown>): string | null {
    const raw = (art?.MedlineCitation as Record<string, unknown> | undefined)?.PMID;

    let pmid: string;
    if (typeof raw === "string" || typeof raw === "number") {
      pmid = String(raw);
    } else if (raw !== null && typeof raw === "object" && "#text" in raw) {
      pmid = String((raw as Record<string, unknown>)["#text"]);
    } else if (raw !== null && typeof raw === "object" && "_" in raw) {
      pmid = String((raw as Record<string, unknown>)["_"]);
    } else {
      return null;
    }

    const trimmed = pmid.trim();
    return /^\d+$/.test(trimmed) ? trimmed : null;
  }

  return articles.map((article) => {
    const art = article as Record<string, unknown>;
    const medline = art.MedlineCitation as Record<string, unknown> | undefined;
    const pmid = getPmid(art);

    const artContent = medline?.Article;
    const articleFields = extractArticle(artContent);
    const authors = extractAuthors(
      (medline?.Article as Record<string, unknown>)?.AuthorList
    );
    const meshTerms = extractMeshTerms(medline?.MeshHeadingList);
    const keywords = extractKeywords(medline?.KeywordList);
    const { epubDate, pubmedDate } = extractHistoryDates(art.PubmedData);

    return {
      pmid: pmid ?? "unknown",
      title: articleFields.title ?? null,
      abstract: articleFields.abstract ?? null,
      journal: articleFields.journal ?? null,
      pubDate: articleFields.pubDate ?? null,
      articleDate: articleFields.articleDate ?? null,
      epubDate,
      pubmedDate,
      publicationTypes: articleFields.publicationTypes ?? [],
      meshTerms,
      keywords,
      authors,
    };
  }).filter((r) => r.pmid && /^\d+$/.test(r.pmid));
}

export async function fetchPubMedRecords(
  pmids: string[]
): Promise<PubMedRecord[]> {
  if (pmids.length === 0) return [];

  const results: PubMedRecord[] = [];
  for (let i = 0; i < pmids.length; i += EFETCH_CHUNK_SIZE) {
    if (i > 0) await delay(EFETCH_CHUNK_DELAY_MS);
    const chunk = pmids.slice(i, i + EFETCH_CHUNK_SIZE);
    const records = await fetchOneChunk(chunk);
    results.push(...records);
  }
  return results;
}
