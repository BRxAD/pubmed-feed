/**
 * Parse a corresponding-author email from PubMed MEDLINE XML.
 * PubMed rarely has a dedicated corresponding-author field; emails usually
 * sit in Affiliation ("Electronic address: a@b.edu") or Identifier Source=email.
 */

export type CorrespondingAuthor = {
  email: string | null;
  name: string | null;
};

function textVal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (typeof v === "number" && !Number.isNaN(v)) return String(v).trim() || null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const t = o["#text"] ?? o["_"];
    if (typeof t === "string") {
      const s = t.trim();
      return s || null;
    }
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

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function normalizeAuthorEmail(raw: string): string | null {
  const trimmed = raw.trim().replace(/[).,;:]+$/g, "").toLowerCase();
  if (!trimmed.includes("@")) return null;
  if (trimmed.length > 254) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

export function emailsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(EMAIL_RE) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const email = normalizeAuthorEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function identifierSource(id: Record<string, unknown>): string {
  return (
    textVal(id["@_Source"]) ??
    textVal(id["Source"]) ??
    ""
  ).toLowerCase();
}

function identifierValue(id: unknown): string | null {
  return textVal(id);
}

function isEmailIdentifierSource(source: string): boolean {
  return source === "e-mail" || source === "email" || source === "e_mail";
}

function authorDisplayName(x: Record<string, unknown>): string | null {
  const last = textVal(x.LastName);
  const fore = textVal(x.ForeName);
  const collective = textVal(x.CollectiveName);
  if (fore && last) return `${fore} ${last}`;
  if (last) return last;
  if (collective) return collective;
  return null;
}

function authorAffiliations(x: Record<string, unknown>): string[] {
  const fromInfo = toArray(x.AffiliationInfo, (ai) =>
    textVal((ai as Record<string, unknown>)?.Affiliation)
  );
  const direct = textVal(x.Affiliation);
  return [...fromInfo, direct].filter((s): s is string => Boolean(s));
}

function authorIdentifierEmails(x: Record<string, unknown>): string[] {
  const ids = toArray(x.Identifier, (id) => id);
  const out: string[] = [];
  for (const id of ids) {
    const rec = (id ?? {}) as Record<string, unknown>;
    const source = identifierSource(rec);
    const value = identifierValue(id);
    if (!value) continue;
    if (isEmailIdentifierSource(source) || value.includes("@")) {
      const emails = emailsFromText(value);
      out.push(...emails);
    }
  }
  return out;
}

type ScoredAuthor = {
  email: string;
  name: string | null;
  score: number;
};

/**
 * Pick one corresponding author from a PubMed AuthorList node.
 * Prefers "Electronic address" / "corresponding", then email identifiers,
 * then the first author who has any email in an affiliation.
 */
export function extractCorrespondingAuthor(
  authorList: unknown
): CorrespondingAuthor {
  const authors = toArray(
    (authorList as Record<string, unknown> | undefined)?.Author,
    (x) => x
  );
  const scored: ScoredAuthor[] = [];

  for (const auth of authors) {
    const x = auth as Record<string, unknown>;
    const affiliations = authorAffiliations(x);
    const affText = affiliations.join(" ");
    const fromIds = authorIdentifierEmails(x);
    const fromAff = emailsFromText(affText);
    const email = fromIds[0] ?? fromAff[0];
    if (!email) continue;

    let score = 1;
    if (/electronic\s+address/i.test(affText)) score += 10;
    if (/correspond/i.test(affText)) score += 8;
    if (fromIds.length > 0) score += 5;

    scored.push({
      email,
      name: authorDisplayName(x),
      score,
    });
  }

  if (scored.length === 0) {
    return { email: null, name: null };
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { email: best.email, name: best.name };
}
