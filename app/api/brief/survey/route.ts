import { NextRequest, NextResponse } from "next/server";
import {
  getBriefDigestFromAddress,
} from "@/lib/digest/config";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { briefPalette } from "@/components/brief/briefTheme";
import {
  clientIpFromHeaders,
  getSurveyPrompt,
  hashSurveyIp,
  markSurveyDeferred,
  markSurveyDone,
  recordSurveyShown,
  surveyMayShow,
} from "@/lib/brief/surveyStore";

export const runtime = "nodejs";

function surveyToAddress(): string {
  const explicit = process.env.BRIEF_SURVEY_EMAIL?.trim();
  if (explicit?.includes("@")) return explicit;
  return "brad.langford@gmail.com";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ipHashFromRequest(request: NextRequest): string {
  return hashSurveyIp(clientIpFromHeaders(request.headers));
}

/** Eligibility — whether this visitor may see the survey. */
export async function GET(request: NextRequest) {
  try {
    const ipHash = ipHashFromRequest(request);
    const row = await getSurveyPrompt(ipHash);
    // If the table is missing, getSurveyPrompt returns null → allow show;
    // client localStorage still enforces the two-prompt rule.
    const show = surveyMayShow(row);
    return NextResponse.json({
      ok: true,
      show,
      status: row?.status ?? null,
      showCount: row?.showCount ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[brief/survey GET]", msg);
    return NextResponse.json({ ok: true, show: true, fallback: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ipHash = ipHashFromRequest(request);
    const body = (await request.json()) as {
      action?: string;
      ease?: number;
      content?: number;
      featuresHelpful?: string;
      contentFeedback?: string;
    };
    const action = body.action?.trim();

    if (action === "shown") {
      const row = await recordSurveyShown(ipHash);
      return NextResponse.json({
        ok: true,
        status: row?.status ?? "deferred",
        showCount: row?.showCount ?? 1,
      });
    }

    if (action === "later") {
      const row = await markSurveyDeferred(ipHash);
      return NextResponse.json({
        ok: true,
        status: row?.status ?? "deferred",
        showCount: row?.showCount ?? 1,
      });
    }

    if (action === "submit") {
      const ease = Number(body.ease);
      const content = Number(body.content);
      if (!Number.isInteger(ease) || ease < 1 || ease > 10) {
        return NextResponse.json(
          { ok: false, error: "Please rate ease of use from 1 to 10." },
          { status: 400 }
        );
      }
      if (!Number.isInteger(content) || content < 1 || content > 10) {
        return NextResponse.json(
          { ok: false, error: "Please rate content from 1 to 10." },
          { status: 400 }
        );
      }
      const featuresHelpful = (body.featuresHelpful ?? "").trim().slice(0, 2000);
      const contentFeedback = (body.contentFeedback ?? "").trim().slice(0, 2000);

      const { plum, olive, paper, steel } = briefPalette;
      const to = surveyToAddress();
      const subject = `Stewardship Brief survey — ease ${ease}/10 · content ${content}/10`;
      const text = [
        "Anonymous homepage survey",
        "",
        `Ease of use: ${ease}/10`,
        `Content: ${content}/10`,
        "",
        "Features or design that would help:",
        featuresHelpful || "(none)",
        "",
        "Content to see more or less of:",
        contentFeedback || "(none)",
      ].join("\n");
      const html = `<!DOCTYPE html><html><body style="max-width:560px;margin:0 auto;padding:24px 20px;background:${paper};color:${plum};font-family:system-ui,sans-serif">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${olive}">Anonymous survey</p>
        <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;font-weight:600">Homepage feedback</p>
        <p style="margin:0 0 8px;font-size:15px"><strong style="color:${steel}">Ease of use:</strong> ${ease}/10</p>
        <p style="margin:0 0 16px;font-size:15px"><strong style="color:${steel}">Content:</strong> ${content}/10</p>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${olive}">Features / design</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(featuresHelpful || "(none)")}</p>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${olive}">Content more / less</p>
        <p style="margin:0;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(contentFeedback || "(none)")}</p>
      </body></html>`;

      await sendDigestEmail({
        to: [to],
        subject,
        html,
        text,
        from: getBriefDigestFromAddress(),
      });

      await markSurveyDone(ipHash);
      return NextResponse.json({ ok: true, status: "done" });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action." },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[brief/survey POST]", msg);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not save your response right now. Please try again later.",
      },
      { status: 500 }
    );
  }
}
