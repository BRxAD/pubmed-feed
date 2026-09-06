import type { Metadata } from "next";
import Link from "next/link";
import BriefSitePage from "@/components/brief/BriefSitePage";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "Sign-in error — The Stewardship Brief",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in is not fully set up yet. The site needs a sign-in secret, and Google keys if you want Google.",
  AccessDenied: "That sign-in is not allowed for this account.",
  OAuthAccountNotLinked:
    "That Google email is already used with a password. Sign in with email and password.",
  Default: "Something went wrong during sign-in. Try Google, or email and a password.",
};

export default async function SettingsErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = MESSAGES[error ?? ""] ?? MESSAGES.Default;

  return (
    <BriefSitePage active="/settings">
      <section className={`${brief.shell} py-20`}>
        <div className="mx-auto max-w-lg text-center">
          <p className={brief.kicker}>Sign-in</p>
          <h1
            className={`mt-3 ${brief.serif} text-3xl font-semibold tracking-tight`}
          >
            Could not sign in
          </h1>
          <p className={`mt-4 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
            {message}
          </p>
          <Link href="/settings" className={`mt-8 inline-block ${brief.action}`}>
            Try again
          </Link>
        </div>
      </section>
    </BriefSitePage>
  );
}
