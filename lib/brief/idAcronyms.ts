/**
 * Common infectious-diseases / antimicrobial-stewardship acronyms that readers
 * of The Stewardship Brief are expected to know without expansion.
 *
 * Paper-coined or uncommon acronyms (e.g. sIM for "serial inflammatory marker")
 * must be written out in plain English — never used bare in headlines, and never
 * introduced as shorthand in summaries.
 */

/** Uppercase forms of allowed acronyms (match case-insensitively). */
export const COMMON_ID_ACRONYMS = new Set([
  // Organisms / resistance
  "MRSA",
  "MSSA",
  "VRE",
  "CRE",
  "CRAB",
  "ESBL",
  "MDRO",
  "MDR",
  "XDR",
  "PDR",
  "CDI",
  "CDIFF",
  // Syndromes / sites
  "CAP",
  "HAP",
  "VAP",
  "UTI",
  "SSTI",
  "BSI",
  "CLABSI",
  "CAUTI",
  "SSI",
  "HAI",
  "IAI",
  "CNS",
  "URI",
  "URTI",
  "LRTI",
  // Settings / care
  "ICU",
  "PICU",
  "NICU",
  "ED",
  "OR",
  "LOS",
  "OPAT",
  "LTC",
  "LTCF",
  "VA",
  // Stewardship / metrics
  "ASP",
  "ASPS",
  "AMS",
  "AMR",
  "AMU",
  "DOT",
  "DDD",
  "AUD",
  // Study / stats
  "RCT",
  "RCTS",
  "CI",
  "HR",
  "RR",
  "OR",
  "NNT",
  "NNH",
  "IQR",
  "SD",
  // Labs / diagnostics
  "CRP",
  "PCT",
  "WBC",
  "ESR",
  "PCR",
  "MIC",
  "PK",
  "PD",
  "AST",
  // Pathogens / diseases
  "HIV",
  "AIDS",
  "TB",
  "COVID",
  "COVID-19",
  "RSV",
  "CMV",
  "EBV",
  "HCV",
  "HBV",
  "HPV",
  "HSV",
  "VZV",
  "CPE",
  // Route / dosing
  "IV",
  "PO",
  "IM",
  "SC",
  "BID",
  "TID",
  "QID",
  // Orgs
  "WHO",
  "CDC",
  "FDA",
  "IDSA",
  "SHEA",
  "SIDP",
  "PIDS",
  "ESCMID",
  "NHS",
  "NIH",
  // Tech (commonly understood)
  "AI",
  "ML",
  "EHR",
  "EMR",
  "CDSS",
  // Geography
  "US",
  "USA",
  "UK",
  "EU",
]);

/** Known paper-coined / unclear forms → plain-English replacements. */
const EXPAND_UNCOMMON: Array<{ re: RegExp; replacement: string }> = [
  {
    re: /\bserial\s+inflammatory\s+marker\s*\(\s*sIMs?\s*\)/gi,
    replacement: "serial inflammatory marker",
  },
  {
    re: /\bserial\s+inflammatory\s+markers?\s*\(\s*sIMs?\s*\)/gi,
    replacement: "serial inflammatory markers",
  },
  {
    re: /\bsIM\s+monitoring\b/g,
    replacement: "serial inflammatory marker monitoring",
  },
  {
    re: /\bsIM\s+utilization\b/g,
    replacement: "serial inflammatory marker utilization",
  },
  {
    re: /\bin\s+sIM\b/g,
    replacement: "in serial inflammatory marker",
  },
  {
    re: /\bbetween\s+sIM\b/g,
    replacement: "between serial inflammatory marker",
  },
  {
    re: /\bsIMs?\b/g,
    replacement: "serial inflammatory markers",
  },
];

/**
 * Extract acronym-like tokens from text (all-caps 2+ letters, COVID-19 style,
 * or camelCase paper acronyms like sIM).
 */
export function extractAcronymCandidates(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  for (const m of text.matchAll(/\b[A-Z]{2,}(?:-\d+)?\b/g)) {
    found.add(m[0]);
  }

  for (const m of text.matchAll(/\b[a-z]{1,3}[A-Z]{2,}\b/g)) {
    found.add(m[0]);
  }

  return [...found];
}

export function isCommonIdAcronym(token: string): boolean {
  const key = token.toUpperCase().replace(/\./g, "");
  if (COMMON_ID_ACRONYMS.has(key)) return true;
  if (key.endsWith("S") && COMMON_ID_ACRONYMS.has(key.slice(0, -1))) return true;
  return false;
}

/** Uncommon acronyms present in text (not on the ID allowlist). */
export function findUncommonAcronyms(text: string): string[] {
  return extractAcronymCandidates(text).filter((t) => !isCommonIdAcronym(t));
}

/**
 * Expand a few known unclear paper acronyms to plain English.
 * Unknown tokens are blocked at generation/validation time instead.
 */
export function expandUncommonAcronyms(text: string): string {
  if (!text) return "";
  let out = text;
  for (const { re, replacement } of EXPAND_UNCOMMON) {
    out = out.replace(re, replacement);
  }
  out = out
    .replace(
      /\bserial inflammatory markers?\s+serial inflammatory markers?\b/gi,
      "serial inflammatory markers"
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

/** Prompt fragment shared by summary + headline generators (going forward). */
export const ID_ACRONYM_PROMPT_RULE = `Acronyms (critical):
- Only use acronyms that are common in infectious diseases / antimicrobial stewardship (e.g. CAP, SSTI, UTI, MRSA, MSSA, CRP, PCT, RCT, ICU, BSI, CLABSI, ASP for stewardship programs, AMS, AMR, IV, PO).
- NEVER introduce or reuse paper-coined / uncommon acronyms (e.g. sIM for serial inflammatory marker monitoring, DASC-LOT, study-specific tool names). Write those concepts out in plain English every time.
- In headlines, prefer plain English; common ID acronyms are allowed when they save space without confusing readers.
- In summaries, common ID acronyms may be defined once on first use in METHODS (e.g. "community-acquired pneumonia (CAP)"); do not invent shorthand for uncommon phrases.`;
