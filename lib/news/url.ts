/** True for absolute http(s) article URLs only. */
export function isHttpUrl(raw: string | null | undefined): boolean {
  const s = raw?.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Prefer a usable article URL; ignore urn: / bare guids. */
export function pickHttpUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const s = c?.trim();
    if (s && isHttpUrl(s)) return s.slice(0, 2000);
  }
  return null;
}

/** First http(s) href in HTML (e.g. Google News description anchors). */
export function firstHttpHrefFromHtml(html: string): string | null {
  if (!html) return null;
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1]?.trim();
    if (href && isHttpUrl(href)) return href.slice(0, 2000);
  }
  return null;
}
