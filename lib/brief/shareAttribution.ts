/** Canonical site credit for shares, graphic takeaway, and digest email. */
export const BRIEF_SITE_URL = "https://www.stewardshipbrief.com";
export const BRIEF_SITE_HOST = "www.stewardshipbrief.com";
export const BRIEF_VIA_LINE = `via ${BRIEF_SITE_HOST}`;

export function articleShareText(options: {
  headline: string;
  bottomLine?: string | null;
  pubmedUrl: string;
}): string {
  return [
    options.headline.trim(),
    options.bottomLine?.trim() || null,
    options.pubmedUrl,
    `${BRIEF_VIA_LINE} ${BRIEF_SITE_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function copyLinkText(pubmedUrl: string): string {
  return `${pubmedUrl}\n\n${BRIEF_VIA_LINE}\n${BRIEF_SITE_URL}`;
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
  const text = `${options.headline.trim()}\n\n${BRIEF_VIA_LINE} ${BRIEF_SITE_URL}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(options.pubmedUrl)}`;
}

export function linkedinShareHref(articleUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;
}

export function facebookShareHref(articleUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`;
}
