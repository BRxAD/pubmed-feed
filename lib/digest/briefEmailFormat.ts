import type { BriefItem } from "@/lib/brief/items";
import { briefPalette } from "@/components/brief/briefTheme";
import {
  BRIEF_SITE_HOST,
  BRIEF_SITE_URL,
  BRIEF_VIA_LINE,
  facebookShareHref,
  linkedinShareHref,
  mailtoShareHref,
  twitterShareHref,
} from "@/lib/brief/shareAttribution";

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

function storyActionsMarkup(
  item: BriefItem,
  steel: string,
  olive: string
): string {
  const read = escapeHtml(item.pubmedUrl);
  const email = escapeHtml(
    mailtoShareHref({
      headline: item.headline,
      bottomLine: item.bottomLine,
      pubmedUrl: item.pubmedUrl,
    })
  );
  const linkedin = escapeHtml(linkedinShareHref(item.pubmedUrl));
  const twitter = escapeHtml(
    twitterShareHref({ headline: item.headline, pubmedUrl: item.pubmedUrl })
  );
  const facebook = escapeHtml(facebookShareHref(item.pubmedUrl));
  const site = escapeHtml(BRIEF_SITE_URL);
  const viaHost = escapeHtml(BRIEF_SITE_HOST);
  const link = `color:${steel};text-decoration:none;font-weight:500`;
  const sep = `<span style="color:${olive}">&nbsp;&middot;&nbsp;</span>`;

  return `
        <p style="margin:12px 0 0;font-size:13px;line-height:1.5;font-family:system-ui,-apple-system,sans-serif">
          <a href="${read}" style="${link}">Read article</a>${sep}<a href="${email}" style="${link}">Email</a>${sep}<a href="${linkedin}" style="${link}">LinkedIn</a>${sep}<a href="${twitter}" style="${link}">X</a>${sep}<a href="${facebook}" style="${link}">Facebook</a>
        </p>
        <p style="margin:8px 0 0;font-size:12px;line-height:1.4;font-family:system-ui,-apple-system,sans-serif;color:${olive}">
          via <a href="${site}" style="color:${steel};text-decoration:none;font-weight:500">${viaHost}</a>
        </p>`;
}

/** Word/Outlook ignores display:none on images, so never send it a second logo. */
function logoMarkup(
  plum: string,
  logoUrl?: string,
  logoLightUrl?: string
): string {
  if (!logoUrl) {
    return `<p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:${plum};letter-spacing:-0.02em;text-align:center">The Stewardship Brief</p>`;
  }

  const src = escapeHtml(logoUrl);
  const outlook = `<img src="${src}" alt="The Stewardship Brief" width="280" style="display:block;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`;

  if (!logoLightUrl) {
    return `<div style="text-align:center">${outlook}</div>`;
  }

  const lightSrc = src;
  const darkSrc = escapeHtml(logoLightUrl);

  return `
<!--[if mso]>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="padding:0 0 12px 0;">
${outlook}
</td></tr></table>
<![endif]-->
<!--[if !mso]><!-->
<img class="sb-logo-light" src="${lightSrc}" alt="The Stewardship Brief" width="280" style="display:block;width:280px;max-width:100%;height:auto;margin:0 auto 12px;border:0;outline:none;" />
<img class="sb-logo-dark" src="${darkSrc}" alt="The Stewardship Brief" width="280" style="display:none;width:0;height:0;max-height:0;overflow:hidden;margin:0;border:0;mso-hide:all;" />
<!--<![endif]-->`;
}

export function buildBriefDigestEmail(options: {
  items: BriefItem[];
  briefUrl: string;
  dateLabel: string;
  logoUrl?: string;
  /** Inverted (light) logo for dark-mode email clients. */
  logoLightUrl?: string;
  /** Per-recipient signed unsubscribe link. */
  unsubscribeUrl?: string;
}): { subject: string; html: string; text: string } {
  const { items, briefUrl, dateLabel, logoUrl, logoLightUrl, unsubscribeUrl } =
    options;
  const { plum, olive, steel, paper, paperWarm, hairline } = briefPalette;

  const subject =
    items.length > 0
      ? `${pluralCount(items.length, "headline", "headlines")} · ${dateLabel}`
      : dateLabel;

  // Prefer brand-domain links in the body (inbox filters penalize mostly-off-domain URLs).
  const briefHost = briefUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");

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

  const darkLogoStyle = logoLightUrl
    ? `<style>
@media (prefers-color-scheme: dark) {
  .sb-logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
  .sb-logo-dark {
    display: block !important;
    width: 280px !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 auto 12px !important;
  }
}
</style>`
    : "";

  const inner: string[] = [
    `<tr><td align="center" style="padding:8px 8px 16px;border-bottom:2px solid ${plum}">`,
    logoMarkup(plum, logoUrl, logoLightUrl),
    `<p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:${olive}">${escapeHtml(dateLabel)}</p>`,
    `</td></tr><tr><td style="padding:20px 8px 8px;font-family:system-ui,sans-serif;font-size:13px">`,
    `<a href="${escapeHtml(briefUrl)}" style="color:${steel};text-decoration:none;font-weight:500">Open today's brief on ${escapeHtml(briefHost)} →</a>`,
    `</td></tr>`,
  ];

  if (items.length === 0) {
    inner.push(
      `<tr><td style="padding:8px 8px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:${plum}">A quiet stretch in the stewardship literature.</td></tr>`
    );
  }

  for (const item of items) {
    // Date only — no study taxonomy / classification labels in email
    const meta = formatDateLabel(item.date);

    textParts.push(
      meta,
      item.headline,
      item.bottomLine ?? "",
      `Read article: ${item.pubmedUrl}`,
      `${BRIEF_VIA_LINE} ${BRIEF_SITE_URL}`,
      ""
    );

    inner.push(`
      <tr>
        <td style="padding:8px 8px 28px;border-bottom:1px solid ${hairline};font-family:system-ui,sans-serif">
        ${
          meta
            ? `<p style="margin:0 0 4px;font-size:11px;line-height:1.3;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${olive}">${escapeHtml(meta)}</p>`
            : ""
        }
        <h2 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;font-weight:600">
          <a href="${escapeHtml(item.pubmedUrl)}" style="color:${plum};text-decoration:none">${escapeHtml(item.headline)}</a>
        </h2>
        ${item.bottomLine ? `<p style="margin:0;font-size:15px;line-height:1.55;color:${plum}">${escapeHtml(item.bottomLine)}</p>` : ""}
        ${storyActionsMarkup(item, steel, olive)}
        </td>
      </tr>
    `);
  }

  inner.push(
    `<tr><td style="padding:32px 8px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding:16px;background:${paperWarm};border:1px solid ${hairline};font-family:system-ui,sans-serif;font-size:14px;font-weight:500">
            <a href="${escapeHtml(briefUrl)}" style="color:${steel};text-decoration:none">View full brief on ${escapeHtml(briefHost)} →</a>
          </td>
        </tr>
      </table>
    </td></tr>`,
    `<tr><td align="center" style="padding:24px 8px 0;font-family:system-ui,sans-serif;font-size:11px;color:${olive};line-height:1.55">
      The Stewardship Brief · Daily antimicrobial stewardship digest<br />
      You receive this because you subscribed at ${escapeHtml(briefHost)}.
    </td></tr>`
  );

  if (unsubscribeUrl) {
    textParts.push(
      "",
      "You subscribed at " + briefHost + ".",
      `Unsubscribe: ${unsubscribeUrl}`
    );
    inner.push(
      `<tr><td align="center" style="padding:16px 8px 0;font-family:system-ui,sans-serif;font-size:11px;color:${olive}">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:${olive};text-decoration:underline">Unsubscribe</a>
        from these emails
      </td></tr>`
    );
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
${darkLogoStyle}
</head>
<body style="margin:0;padding:0;background:${paper};color:${plum};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${paper};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          ${inner.join("")}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    text: textParts.filter(Boolean).join("\n"),
  };
}

/** Fix legacy pluralization bug: "study" + "ies" → "studyies". */
export function pluralizeStudies(count: number): string {
  return pluralCount(count, "study", "studies");
}
