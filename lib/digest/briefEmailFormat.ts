import type { BriefItem } from "@/lib/brief/items";
import { briefPalette } from "@/components/brief/briefTheme";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateLabel(iso: string | null): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso.trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function pluralCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildBriefDigestEmail(options: {
  items: BriefItem[];
  briefUrl: string;
  dateLabel: string;
  logoUrl?: string;
  /** Per-recipient signed unsubscribe link. */
  unsubscribeUrl?: string;
}): { subject: string; html: string; text: string } {
  const { items, briefUrl, dateLabel, logoUrl, unsubscribeUrl } = options;
  const { plum, olive, steel, salmon, paper, paperWarm, hairline } = briefPalette;

  const subject =
    items.length > 0
      ? `The Stewardship Brief — ${pluralCount(items.length, "headline", "headlines")} · ${dateLabel}`
      : `The Stewardship Brief — ${dateLabel}`;

  const textParts = [
    "THE STEWARDSHIP BRIEF",
    dateLabel,
    "",
    `Read online: ${briefUrl}`,
    "",
  ];

  if (items.length === 0) {
    textParts.push("No new high-priority studies in this brief.", "");
  }

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="The Stewardship Brief" width="560" style="display:block;max-width:100%;height:auto;margin:0 auto 12px" />`
    : `<p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:${plum};letter-spacing:-0.02em;text-align:center">The Stewardship Brief</p>`;

  const htmlParts: string[] = [
    `<div style="text-align:center;padding:8px 0 16px;border-bottom:2px solid ${plum}">`,
    logoBlock,
    `<p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:${olive}">${escapeHtml(dateLabel)}</p>`,
    `</div>`,
    `<p style="font-family:system-ui,sans-serif;font-size:13px;margin:20px 0 24px"><a href="${escapeHtml(briefUrl)}" style="color:${steel};text-decoration:none;font-weight:500">Open the daily brief →</a></p>`,
  ];

  if (items.length === 0) {
    htmlParts.push(
      `<p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:${plum};margin:0 0 24px">A quiet stretch in the stewardship literature.</p>`
    );
  }

  for (const item of items) {
    // Date only — no study taxonomy / classification labels in email
    const meta = formatDateLabel(item.date);

    textParts.push(
      item.headline,
      item.bottomLine ?? "",
      meta,
      item.pubmedUrl,
      ""
    );

    htmlParts.push(`
      <article style="margin:0 0 28px;padding:0 0 28px;border-bottom:1px solid ${hairline};font-family:system-ui,sans-serif">
        <h2 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;font-weight:600">
          <a href="${escapeHtml(item.pubmedUrl)}" style="color:${plum};text-decoration:none">${escapeHtml(item.headline)}</a>
        </h2>
        ${item.bottomLine ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:${plum}">${escapeHtml(item.bottomLine)}</p>` : ""}
        ${meta ? `<p style="margin:0;font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:${olive}">${escapeHtml(meta)}</p>` : ""}
        ${item.isNew ? `<p style="margin:10px 0 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${salmon}">New</p>` : ""}
      </article>
    `);
  }

  htmlParts.push(
    `<div style="margin-top:32px;padding:16px;background:${paperWarm};border:1px solid ${hairline};text-align:center">
      <a href="${escapeHtml(briefUrl)}" style="font-family:system-ui,sans-serif;font-size:14px;font-weight:500;color:${steel};text-decoration:none">View full brief with images →</a>
    </div>`,
    `<p style="font-family:system-ui,sans-serif;font-size:11px;color:${olive};margin-top:24px;text-align:center">The Stewardship Brief · Daily antimicrobial stewardship digest</p>`
  );

  if (unsubscribeUrl) {
    textParts.push("", `Unsubscribe: ${unsubscribeUrl}`);
    htmlParts.push(
      `<p style="font-family:system-ui,sans-serif;font-size:11px;color:${olive};margin-top:16px;text-align:center">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:${olive};text-decoration:underline">Unsubscribe</a>
        from these emails
      </p>`
    );
  }

  return {
    subject,
    html: `<!DOCTYPE html><html><body style="max-width:600px;margin:0 auto;padding:24px 20px;background:${paper};color:${plum}">${htmlParts.join("")}</body></html>`,
    text: textParts.filter(Boolean).join("\n"),
  };
}

/** Fix legacy pluralization bug: "study" + "ies" → "studyies". */
export function pluralizeStudies(count: number): string {
  return pluralCount(count, "study", "studies");
}
