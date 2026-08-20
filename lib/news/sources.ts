import "server-only";
import type { NewsSourceId } from "@/lib/news/labels";

export type { NewsSourceId };

export type NewsSource = {
  id: NewsSourceId;
  label: string;
  feedUrl: string;
  /** When true, keep only items matching AMS/AMR keyword filter. */
  requireTopicMatch: boolean;
};

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: "who",
    label: "WHO",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    requireTopicMatch: true,
  },
  {
    id: "cidrap",
    label: "CIDRAP",
    feedUrl: "https://www.cidrap.umn.edu/rss.xml",
    requireTopicMatch: true,
  },
  {
    id: "google-news",
    label: "Google News",
    feedUrl:
      "https://news.google.com/rss/search?q=%22antimicrobial+stewardship%22+OR+%22antibiotic+stewardship%22+OR+%22antimicrobial+resistance%22+OR+%22antibiotic+resistance%22&hl=en-US&gl=US&ceid=US:en",
    requireTopicMatch: false,
  },
];

/** Loose topical gate for broad feeds (WHO, CIDRAP). */
export function matchesNewsTopic(text: string): boolean {
  return /\b(antimicrobial|antibiotic|antibacterial|stewardship|amr\b|ams\b|resistance|resistome|one health|infection prevention|hai\b|nosocomial)\b/i.test(
    text
  );
}
