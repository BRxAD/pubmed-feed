import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getBriefDigestFromAddress } from "@/lib/digest/config";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { briefPalette } from "@/components/brief/briefTheme";

export const runtime = "nodejs";

function buildWelcomeEmail(email: string): {
  subject: string;
  html: string;
  text: string;
} {
  const { plum, olive, steel, paper } = briefPalette;
  const briefUrl = publicAppBaseUrl();
  const subject = "You're subscribed to The Stewardship Brief";
  const text = [
    "You're on The Stewardship Brief list.",
    "You'll get the daily email with top headlines and one bottom line each.",
    "",
    `Read online anytime: ${briefUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="max-width:560px;margin:0 auto;padding:28px 20px;background:${paper};color:${plum};font-family:system-ui,-apple-system,sans-serif">
    <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:${plum}">The Stewardship Brief</p>
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${olive}">Morning email confirmed</p>
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;margin:0 0 16px">
      You’re on the list. Look for the daily brief — headlines and one bottom line each.
    </p>
    <p style="margin:0 0 24px;font-size:14px">
      <a href="${briefUrl}" style="color:${steel};text-decoration:none;font-weight:500">Open today’s brief →</a>
    </p>
    <p style="margin:0;font-size:11px;color:${olive}">Signed up as ${email}</p>
  </body></html>`;

  return { subject, html, text };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Valid email required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("brief_subscribers")
      .upsert({ email }, { onConflict: "email" });

    if (error) {
      if (
        error.message.toLowerCase().includes("brief_subscribers") ||
        error.code === "42P01"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Signup storage not ready — run scripts/add_brief_subscribers.sql in Supabase.",
          },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    let welcomeSent = false;
    let welcomeWarning: string | undefined;
    try {
      const welcome = buildWelcomeEmail(email);
      await sendDigestEmail({
        to: [email],
        subject: welcome.subject,
        html: welcome.html,
        text: welcome.text,
        from: getBriefDigestFromAddress(),
      });
      welcomeSent = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[brief/subscribe] welcome email failed:", msg);
      const usingOnboarding =
        !process.env.BRIEF_FROM_EMAIL?.trim() &&
        !process.env.DIGEST_FROM_EMAIL?.trim();
      welcomeWarning = usingOnboarding
        ? "Saved your signup, but confirmation could not be sent. Set BRIEF_FROM_EMAIL in Vercel to an address on your verified Resend domain (e.g. The Stewardship Brief <brief@yourdomain.com>), then redeploy."
        : `Saved your signup, but confirmation could not be sent (${msg}). Check that BRIEF_FROM_EMAIL uses your verified Resend domain and that the domain status is Verified.`;
    }

    return NextResponse.json({
      ok: true,
      welcomeSent,
      ...(welcomeWarning ? { warning: welcomeWarning } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("SUPABASE")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Server configuration incomplete — contact the site admin.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
