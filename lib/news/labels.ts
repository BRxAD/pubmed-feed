export type NewsSourceId = "who" | "cidrap" | "cidrap-asp" | "google-news";

const LABELS: Record<string, string> = {
  who: "WHO",
  cidrap: "CIDRAP",
  "cidrap-asp": "CIDRAP ASP",
  "google-news": "Google News",
};

export function newsSourceLabel(id: string): string {
  return LABELS[id] ?? id;
}
