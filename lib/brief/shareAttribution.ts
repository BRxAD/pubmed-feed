/** Canonical site credit for copied / outbound shares (not the digest email). */
export const BRIEF_SITE_URL = "https://www.stewardshipbrief.com";
export const BRIEF_SITE_HOST = "www.stewardshipbrief.com";
export const BRIEF_VIA_LINE = `via ${BRIEF_SITE_HOST}`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text paste: one PubMed URL and one site URL, both auto-linkable. */
export function copyLinkText(pubmedUrl: string): string {
  return `${pubmedUrl}\n\nvia ${BRIEF_SITE_URL}`;
}

/** Rich paste: PubMed and “via www.stewardshipbrief.com” as real links. */
export function copyLinkHtml(pubmedUrl: string): string {
  const pub = escapeHtml(pubmedUrl);
  const site = escapeHtml(BRIEF_SITE_URL);
  const host = escapeHtml(BRIEF_SITE_HOST);
  return `<a href="${pub}">${pub}</a><br><br>via <a href="${site}">${host}</a>`;
}

export async function copyArticleLinks(pubmedUrl: string): Promise<void> {
  const plain = copyLinkText(pubmedUrl);
  const html = copyLinkHtml(pubmedUrl);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    }
  } catch {
    // Fall through to plain text.
  }
  await navigator.clipboard.writeText(plain);
}

export function articleShareText(options: {
  headline: string;
  bottomLine?: string | null;
  pubmedUrl: string;
}): string {
  return [
    options.headline.trim(),
    options.bottomLine?.trim() || null,
    options.pubmedUrl,
    `via ${BRIEF_SITE_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function graphicTakeawayShareText(options: {
  headline: string;
  bottomLine?: string | null;
  pubmedUrl: string;
}): string {
  return articleShareText(options);
}

export function mailtoShareHref(options: {
  headline: string;
  bottomLine?: string | null;
  pubmedUrl: string;
}): string {
  const body = articleShareText(options);
  return `mailto:?subject=${encodeURIComponent(options.headline)}&body=${encodeURIComponent(body)}`;
}

export function twitterShareHref(options: {
  headline: string;
  pubmedUrl: string;
}): string {
  const text = `${options.headline.trim()}\n\n${options.pubmedUrl}\n\nvia ${BRIEF_SITE_URL}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function linkedinShareHref(articleUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;
}

export function facebookShareHref(articleUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`;
}
