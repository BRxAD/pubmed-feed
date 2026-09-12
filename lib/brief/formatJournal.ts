/**
 * Formats academic journal names in title case for clean editorial presentation.
 *
 * Rules applied:
 * - Capitalizes the first letter of each word (e.g. "Journal", "Infection", "Public").
 * - Keeps minor grammatical words lowercase unless at the start of a title or subtitle
 *   (e.g. "and", "of", "in", "for", "the", "a", "an", "on", "at", "by", "with", "from", "as", "via").
 * - Handles subtitle boundaries after colons, em dashes, slashes, or periods
 *   (e.g. "The Lancet. Infectious Diseases", "Clinical Infectious Diseases: An Official Publication...").
 * - Preserves medical / scientific acronyms and brand names
 *   (e.g. "BMJ", "JAMA", "NEJM", "PLOS", "BMC", "CID", "JAC", "AAC", "MMWR", "OFID", "ICHE", "AJIC", "IDSA", "SHEA", "WHO", "CDC", "HIV", "AIDS", "COVID-19", "IJID", "QJM", "npj").
 * - Preserves interior capitalization in names like "eClinicalMedicine", "eBioMedicine", "SciELO".
 * - Supports hyphenated compounds (e.g. "Health-System", "Anti-Infective").
 * - Normalizes ALL-CAPS names from databases (e.g. "PEDIATRICS" → "Pediatrics").
 */

const MINOR_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
  "of",
  "in",
  "to",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "into",
  "through",
  "via",
  "about",
  "over",
  "off",
  "per",
  "de",
  "la",
  "le",
  "les",
  "des",
  "du",
  "del",
  "und",
  "et",
  "der",
  "die",
  "das",
]);

const KNOWN_ACRONYMS = new Set([
  "BMJ",
  "JAMA",
  "NEJM",
  "PLOS",
  "BMC",
  "CID",
  "JAC",
  "AAC",
  "MMWR",
  "OFID",
  "ICHE",
  "AJIC",
  "IDSA",
  "SHEA",
  "WHO",
  "CDC",
  "HIV",
  "AIDS",
  "COVID-19",
  "IJID",
  "QJM",
  "CERN",
  "USA",
  "UK",
]);

export function formatJournalTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const isAllUpper = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

  return trimmed.replace(/[^\s:;–—\.\/]+/g, (word, offset, fullStr) => {
    const before = fullStr.slice(0, offset).trim();
    const isFirstWord = before.length === 0;
    const isAfterMajorPunctuation = /[:;–—\.\/\(\[]$/.test(before);

    const cleanWord = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const lowerClean = cleanWord.toLowerCase();
    const upperClean = cleanWord.toUpperCase();

    if (!cleanWord) return word;

    // Check if known acronym
    if (KNOWN_ACRONYMS.has(upperClean)) {
      return word.replace(cleanWord, upperClean);
    }

    // npj special case (e.g. npj Antimicrobials and Resistance)
    if (lowerClean === "npj") {
      return word.replace(cleanWord, "npj");
    }

    // Preserve words with interior uppercase (e.g. eClinicalMedicine, eBioMedicine, SciELO)
    if (/[a-z][A-Z]/.test(cleanWord) || /^[a-z][A-Z]/.test(cleanWord)) {
      return word;
    }

    // Roman numerals (I, II, III, IV, etc.)
    if (
      /^(?=[MDCLXVI])M*(C[MD]|D?C*)(X[CL]|L?X*)(I[XV]|V?I*)$/i.test(cleanWord) &&
      cleanWord.length <= 4
    ) {
      return word.replace(cleanWord, upperClean);
    }

    // If all-uppercase word in a non-all-upper title and length <= 5, keep it (e.g. IJID, QJM)
    if (
      !isAllUpper &&
      cleanWord === upperClean &&
      cleanWord.length >= 2 &&
      cleanWord.length <= 5
    ) {
      return word;
    }

    // If it's a minor word and NOT at the start of sentence/subtitle
    if (
      MINOR_WORDS.has(lowerClean) &&
      !isFirstWord &&
      !isAfterMajorPunctuation
    ) {
      return word.replace(cleanWord, lowerClean);
    }

    // Otherwise, capitalize first letter of each hyphenated part or the word
    return word
      .split("-")
      .map((part, pIdx) => {
        const partClean = part.replace(
          /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
          ""
        );
        const partLower = partClean.toLowerCase();
        if (!partClean) return part;
        if (pIdx > 0 && MINOR_WORDS.has(partLower)) {
          return part.replace(partClean, partLower);
        }
        const capitalized =
          partClean.charAt(0).toUpperCase() + partClean.slice(1).toLowerCase();
        return part.replace(partClean, capitalized);
      })
      .join("-");
  });
}
