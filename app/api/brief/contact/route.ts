import { NextRequest, NextResponse } from "next/server";
import {
  getBriefContactToAddress,
  getBriefDigestFromAddress,
} from "@/lib/digest/config";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { briefPalette } from "@/components/brief/briefTheme";

export const runtime = "nodejs";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      message?: string;
    };

    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const message = body.message?.trim() ?? "";

    if (!name || name.length > 120) {
      return NextResponse.json(
        { ok: false, error: "Please include your name." },
        { status: 400 }
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "A valid email is required." },
        { status: 400 }
      );
    }
    if (!message || message.length < 10) {
      return NextResponse.json(
        { ok: false, error: "Please write a short message." },
        { status: 400 }
      );
    }
    if (message.length > 5000) {
      return NextResponse.json(
        { ok: false, error: "Message is too long." },
        { status: 400 }
      );
    }

    const { plum, olive, paper } = briefPalette;
    const to = getBriefContactToAddress();
    const subject = `Stewardship Brief contact — ${name}`;
    const text = [
      `From: ${name} <${email}>`,
      "",
      message,
    ].join("\n");
    const html = `<!DOCTYPE html><html><body style="max-width:560px;margin:0 auto;padding:24px 20px;background:${paper};color:${plum};font-family:system-ui,sans-serif">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${olive}">Contact form</p>
      <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;font-weight:600">Message from ${escapeHtml(name)}</p>
      <p style="margin:0 0 20px;font-size:13px;color:${olive}">${escapeHtml(email)}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p>
    </body></html>`;

    await sendDigestEmail({
      to: [to],
      subject,
      html,
      text,
      from: getBriefDigestFromAddress(),
      replyTo: email,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[brief/contact]", msg);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not send your message right now. Please try again later.",
      },
      { status: 500 }
    );
  }
}
