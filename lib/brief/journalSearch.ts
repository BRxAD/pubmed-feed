export type BriefSearchMode = "text" | "journal";

/**
 * Decide when a brief search is a journal name.
 * "Antimicrobial Stewardship & Healthcare Epidemiology" must match both the
 * short name and the PubMed form "… : ASHE", and nothing from other journals.
 * A one-word query such as "Antibiotics" stays a normal text search.
 */

export function normalizeJournalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
}

/** Title before a PubMed colon subtitle, with place names and "The" removed. */
export function journalFamilyKey(journal: string): string {
  const title = journal.split(":")[0] ?? journal;
  return normalizeJournalName(title);
}

function journalAcronyms(journal: string): string[] {
  const found = new Set<string>();
  for (const part of journal.split(":").slice(1)) {
    const token = part.trim().match(/^([A-Z][A-Z0-9]{2,7})\b/);
    if (token) found.add(token[1].toLowerCase());
  }
  for (const match of journal.matchAll(/\(([A-Z][A-Z0-9]{2,7})\)/g)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

/**
 * Stored journal strings for this query when it names exactly one journal.
 * Null means "keep searching titles, abstracts, and authors".
 */
export function journalsForQuery(
  journals: Iterable<string>,
  rawQuery: string
): string[] | null {
  const query = rawQuery.trim();
  if (query.length < 3) return null;

  const words = query.split(/\s+/).filter(Boolean);
  const multiWord = words.length >= 2;
  const acronymQuery =
    words.length === 1 && /^[A-Za-z][A-Za-z0-9]{2,7}$/.test(query);
  if (!multiWord && !acronymQuery) return null;

  const wanted = acronymQuery ? query.toLowerCase() : normalizeJournalName(query);
  if (!wanted) return null;

  const families = new Map<
    string,
    { names: string[]; aliases: Set<string>; acronyms: Set<string> }
  >();

  for (const journal of journals) {
    const name = journal.trim();
    if (!name) continue;
    const key = journalFamilyKey(name);
    if (!key) continue;
    let family = families.get(key);
    if (!family) {
      family = { names: [], aliases: new Set([key]), acronyms: new Set() };
      families.set(key, family);
    }
    if (!family.names.includes(name)) family.names.push(name);
    family.aliases.add(normalizeJournalName(name));
    for (const acronym of journalAcronyms(name)) family.acronyms.add(acronym);
  }

  const matched: string[] = [];
  let familiesHit = 0;
  for (const family of families.values()) {
    const hit = acronymQuery
      ? family.acronyms.has(wanted)
      : family.aliases.has(wanted);
    if (!hit) continue;
    familiesHit += 1;
    matched.push(...family.names);
  }
  if (familiesHit !== 1) return null;
  return matched;
}
