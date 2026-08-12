/**
 * Decode HTML entities in PubMed / LLM text (e.g. &#x3b2; → β, &beta; → β).
 * Prefer real Unicode symbols; leave unknown named entities unchanged.
 */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  minus: "−",
  le: "≤",
  ge: "≥",
  ne: "≠",
  micro: "µ",
  // Greek (PubMed titles often use these for drugs / organisms)
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Mu: "Μ",
  Sigma: "Σ",
  Omega: "Ω",
};

function fromCodePoint(cp: number): string | null {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null;
  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}

/** Decode numeric + common named HTML entities. Safe on plain text. */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;

  let s = input.replace(/&#x([0-9a-fA-F]+);/g, (full, hex: string) => {
    const ch = fromCodePoint(parseInt(hex, 16));
    return ch ?? full;
  });

  s = s.replace(/&#(\d+);/g, (full, dec: string) => {
    const ch = fromCodePoint(parseInt(dec, 10));
    return ch ?? full;
  });

  s = s.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (full, name: string) => {
    return NAMED[name] ?? full;
  });

  return s;
}
