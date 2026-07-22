import { NextResponse } from "next/server";

/**
 * Shows which env vars are configured (values never exposed).
 * Use after adding secrets in Vercel to confirm a redeploy picked them up.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    /** Which deployment answered — compare to your browser URL / Vercel project domain. */
    deployment: {
      vercelUrl: process.env.VERCEL_URL ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    },
    productionUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    configured: {
      CRON_SECRET: Boolean(process.env.CRON_SECRET?.trim()),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY?.trim()),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
      OPENALEX_MAILTO: Boolean(process.env.OPENALEX_MAILTO?.trim()),
      NCBI_EMAIL: Boolean(process.env.NCBI_EMAIL?.trim()),
      BRIEF_FROM_EMAIL: Boolean(process.env.BRIEF_FROM_EMAIL?.trim()),
      DIGEST_FROM_EMAIL: Boolean(process.env.DIGEST_FROM_EMAIL?.trim()),
      DIGEST_REPLY_TO: Boolean(process.env.DIGEST_REPLY_TO?.trim()),
      SUPABASE_URL: Boolean(
        (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
      ),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ),
    },
    /** True when From still falls back to Resend's shared onboarding sender. */
    briefFromUsesOnboarding:
      !process.env.BRIEF_FROM_EMAIL?.trim() &&
      !process.env.DIGEST_FROM_EMAIL?.trim(),
    digestRecipientUses:
      process.env.DIGEST_RECIPIENT_EMAILS?.trim()
        ? "DIGEST_RECIPIENT_EMAILS"
        : process.env.NCBI_EMAIL?.trim()
          ? "NCBI_EMAIL"
          : process.env.OPENALEX_MAILTO?.trim()
            ? "OPENALEX_MAILTO"
            : "none",
  });
}
