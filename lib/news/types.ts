export type NewsItemStatus = "pending" | "approved" | "rejected";

export type NewsItem = {
  id: string;
  sourceId: string;
  guid: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
  /** Optional article thumbnail (from RSS media or og:image). */
  imageUrl: string | null;
  status: NewsItemStatus;
  approvedAt: string | null;
  createdAt: string;
};
