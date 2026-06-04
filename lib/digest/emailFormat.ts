import type { FeedSource } from "@/lib/feedSource";
import type { DigestItem } from "@/lib/digest/items";

const SOURCE_LABELS: Record<FeedSource, string> = {
  pubmed: "PubMed",
  openalex: "OpenAlex",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateLabel(iso: string | null): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildDigestEmail(options: {
  items: DigestItem[];
  topicName: string;
  feedUrl: string;
  minRelevancePercent: number;
  periodLabel: string;
  source: FeedSource;
}): { subject: string; html: string; text: string } {
  const { items, topicName, feedUrl, minRelevancePercent, periodLabel, source } =
    options;

  const sourceLabel = SOURCE_LABELS[source];
  const accentColor = source === "openalex" ? "#2563eb" : "#d97706";
  const accentBg = source === "openalex" ? "#eff6ff" : "#fffbeb";

  const subject =
    items.length > 0
      ? `[${sourceLabel}] ASP digest: ${items.length} study${items.length === 1 ? "" : "ies"} ≥${minRelevancePercent}% relevance`
      : `[${sourceLabel}] ASP digest: no new studies ≥${minRelevancePercent}% relevance`;

  const intro = `${sourceLabel} feed — antimicrobial stewardship digest for ${periodLabel}. Studies at or above ${minRelevancePercent}% relevance.`;

  const textParts = [
    intro,
    "",
    `View full feed: ${feedUrl}`,
    "",
  ];

  const htmlParts: string[] = [
    `<p style="font-family:system-ui,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${accentColor}">${escapeHtml(sourceLabel)} feed</p>`,
    `<p style="font-family:system-ui,sans-serif;color:#333;line-height:1.5">${escapeHtml(intro)}</p>`,
    `<p style="font-family:system-ui,sans-serif"><a href="${escapeHtml(feedUrl)}">Open ${escapeHtml(sourceLabel)} feed</a></p>`,
  ];

  if (items.length === 0) {
    textParts.push("No new summarized articles met the relevance threshold today.");
    htmlParts.push(
      `<p style="font-family:system-ui,sans-serif;color:#666">No new summarized articles met the relevance threshold today.</p>`
    );
  } else {
    for (const item of items) {
      const meta = [
        item.journal,
        formatDateLabel(item.date),
        item.studyLabel,
        `${item.relevancePercent}% relevance`,
      ]
        .filter(Boolean)
        .join(" · ");

      textParts.push(
        `${item.title}`,
        meta,
        item.methods ? `Methods: ${item.methods}` : "",
        item.results ? `Results: ${item.results}` : "",
        item.bottomLine ? `Bottom line: ${item.bottomLine}` : "",
        item.url,
        ""
      );

      htmlParts.push(`
        <div style="margin:24px 0;padding:16px;border-left:4px solid ${accentColor};background:${accentBg};font-family:system-ui,sans-serif">
          <h2 style="margin:0 0 8px;font-size:18px;line-height:1.35">
            <a href="${escapeHtml(item.url)}" style="color:#1a1a1a;text-decoration:none">${escapeHtml(item.title)}</a>
          </h2>
          <p style="margin:0 0 12px;font-size:13px;color:#666">${escapeHtml(meta)}</p>
          ${item.methods ? `<p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Methods</strong> ${escapeHtml(item.methods)}</p>` : ""}
          ${item.results ? `<p style="margin:0 0 8px;font-size:14px;color:#333"><strong>Results</strong> ${escapeHtml(item.results)}</p>` : ""}
          ${item.bottomLine ? `<p style="margin:0;font-size:14px;color:#92400e"><strong>Bottom line</strong> ${escapeHtml(item.bottomLine)}</p>` : ""}
        </div>
      `);
    }
  }

  htmlParts.push(
    `<p style="font-family:system-ui,sans-serif;font-size:12px;color:#999;margin-top:32px">${escapeHtml(sourceLabel)} · ${escapeHtml(topicName)} · Automated digest</p>`
  );

  return {
    subject,
    html: `<!DOCTYPE html><html><body style="max-width:640px;margin:0 auto;padding:24px">${htmlParts.join("")}</body></html>`,
    text: textParts.filter(Boolean).join("\n"),
  };
}
