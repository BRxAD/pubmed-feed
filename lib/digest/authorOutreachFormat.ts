import { briefPalette } from "@/components/brief/briefTheme";
import { formatJournalTitle } from "@/lib/brief/formatJournal";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export const AUTHOR_OUTREACH_SUBJECT =
  "Your publication was included in The Stewardship Brief";

export type AuthorOutreachCopyInput = {
  headline: string;
  title?: string | null;
  journal?: string | null;
  articleUrl: string;
  optOutUrl?: string;
  logoUrl?: string;
  /** Custom letter body (plain text). Footer is always appended. */
  bodyText?: string;
};

export const AUTHOR_OUTREACH_SIGN_OFF =
  "Congratulations on publishing this important work.\nBrad Langford PharmD MPH";

function defaultLetterBody(input: {
  headline: string;
  journalLine: string;
  articleUrl: string;
}): string {
  const lines = [
    "Your recent publication was included in our antimicrobial stewardship digest.",
    "",
    input.headline,
  ];
  if (input.journalLine) {
    lines.push(input.journalLine);
  }
  lines.push("", "See the summary:", input.articleUrl);
  return lines.join("\n");
}

function letterHtmlFromText(text: string, steel: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const withBreaks = escapeHtml(block).replace(/\n/g, "<br />");
      const linked = withBreaks.replace(
        /(https?:\/\/[^\s<]+)/g,
        `<a href="$1" style="color:${steel};text-decoration:underline">$1</a>`
      );
      return `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#1C0B19">${linked}</p>`;
    })
    .join("");
}

export function buildAuthorOutreachEmail(input: AuthorOutreachCopyInput): {
  subject: string;
  html: string;
  text: string;
  bodyText: string;
} {
  const { plum, olive, steel, paper, paperWarm, hairline } = briefPalette;
  const headline =
    input.headline.trim() || input.title?.trim() || "your recent publication";
  const journalLine = input.journal
    ? formatJournalTitle(input.journal)
    : "";
  const bodyText = (input.bodyText?.trim() ||
    defaultLetterBody({
      headline,
      journalLine,
      articleUrl: input.articleUrl,
    })).trim();

  const signedBody = bodyText.includes("Congratulations on publishing this important work")
    ? bodyText
    : `${bodyText}\n\n${AUTHOR_OUTREACH_SIGN_OFF}`;

  const optOutLine =
    "If you prefer not to receive notifications when your papers are featured, click here to opt out.";

  const textParts = [signedBody, ""];
  if (input.optOutUrl) {
    textParts.push(optOutLine, input.optOutUrl);
  } else {
    textParts.push(optOutLine);
  }

  const logo = input.logoUrl
    ? `<img src="${escapeAttr(input.logoUrl)}" alt="The Stewardship Brief" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:0 auto 16px;border:0;" />`
    : `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:${plum};text-align:center">The Stewardship Brief</p>`;

  const optOutHtml = input.optOutUrl
    ? `<p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;color:${olive};line-height:1.55">
        If you prefer not to receive notifications when your papers are featured,
        <a href="${escapeAttr(input.optOutUrl)}" style="color:${olive};text-decoration:underline">click here to opt out</a>.
      </p>`
    : `<p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;color:${olive};line-height:1.55">${escapeHtml(optOutLine)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:${paper};color:${plum};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${paper};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 8px">${logo}</td>
          </tr>
          <tr>
            <td style="padding:24px;background:#fff;border:1px solid ${hairline}">
              ${letterHtmlFromText(signedBody, steel)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-family:system-ui,sans-serif;font-size:11px;color:${olive};line-height:1.55;background:${paperWarm}">
              The Stewardship Brief · antimicrobial stewardship digest
              ${optOutHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: AUTHOR_OUTREACH_SUBJECT,
    html,
    text: textParts.join("\n"),
    bodyText,
  };
}
