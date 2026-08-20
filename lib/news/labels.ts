export type NewsSourceId = "who" | "cidrap" | "google-news";

const LABELS: Record<string, string> = {
  who: "WHO",
  cidrap: "CIDRAP",
  "google-news": "Google News",
};

export function newsSourceLabel(id: string): string {
  return LABELS[id] ?? id;
}
