import type { Metadata } from "next";
import Link from "next/link";
import BriefSitePage from "@/components/brief/BriefSitePage";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "Check your email — The Stewardship Brief",
  robots: { index: false, follow: false },
};

export default function SettingsVerifyPage() {
  return (
    <BriefSitePage active="/settings">
      <section className={`${brief.shell} py-20`}>
        <div className="mx-auto max-w-lg text-center">
          <p className={brief.kicker}>Sign-in</p>
          <h1
            className={`mt-3 ${brief.serif} text-3xl font-semibold tracking-tight`}
          >
            Check your email
          </h1>
          <p className={`mt-4 ${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
            We sent a one-time sign-in link. It expires in 24 hours. After you
            open it, you can set your email preferences.
          </p>
          <Link href="/settings" className={`mt-8 inline-block ${brief.action}`}>
            Back to email settings
          </Link>
        </div>
      </section>
    </BriefSitePage>
  );
}
