import { NextResponse } from "next/server";

/**
 * Shows which env vars are configured (values never exposed).
 * Use after adding secrets in Vercel to confirm a redeploy picked them up.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    productionUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    configured: {
      CRON_SECRET: Boolean(process.env.CRON_SECRET?.trim()),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY?.trim()),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
      OPENALEX_MAILTO: Boolean(process.env.OPENALEX_MAILTO?.trim()),
      NCBI_EMAIL: Boolean(process.env.NCBI_EMAIL?.trim()),
      SUPABASE_URL: Boolean(
        (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
      ),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ),
    },
    digestRecipientUses:
      process.env.DIGEST_RECIPIENT_EMAILS?.trim()
        ? "DIGEST_RECIPIENT_EMAILS"
        : process.env.OPENALEX_MAILTO?.trim()
          ? "OPENALEX_MAILTO"
          : process.env.NCBI_EMAIL?.trim()
            ? "NCBI_EMAIL"
            : "none",
  });
}
