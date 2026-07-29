import type { Metadata } from "next";
import Link from "next/link";
import BriefSitePage from "@/components/brief/BriefSitePage";
import { brief } from "@/components/brief/briefTheme";

export const metadata: Metadata = {
  title: "About — The Stewardship Brief",
  description:
    "How The Stewardship Brief uses AI to surface the most influential antimicrobial stewardship research.",
};

export default function AboutPage() {
  return (
    <BriefSitePage title="About">
      <article className="space-y-8">
        <p
          className={`${brief.serif} text-xl sm:text-[1.35rem] leading-[1.55] ${brief.ink}`}
        >
          Antimicrobial stewardship is a rapidly developing field. Lots of new
          research informs our practice, but some is more influential than
          others.
        </p>

        <div className={`h-px w-16 bg-[#2A79A7]/50`} aria-hidden />

        <p className={`${brief.sans} text-[0.9375rem] leading-[1.7] ${brief.deck}`}>
          To keep up with this growing body of literature and identify the most
          impactful articles,{" "}
          <span className="font-medium text-[#1C0B19]">
            The Stewardship Brief
          </span>{" "}
          aims to leverage AI to intake, summarize, classify, and rank new
          research in the field.
        </p>

        <aside
          className={`rounded-sm border-l-4 border-[#7BC1D4] bg-[#EFECE4]/60 px-5 py-4`}
        >
          <p className={`${brief.meta} mb-1`}>Developed by</p>
          <p className={`${brief.serif} text-lg font-semibold tracking-tight`}>
            Bradley Langford, PharmD, MPH
          </p>
        </aside>

        <p className={`${brief.sans} text-sm leading-relaxed ${brief.muted}`}>
          <Link href="/contact" className={`${brief.accent} ${brief.accentHover} underline-offset-2 hover:underline`}>
            Contact us
          </Link>{" "}
          for more information, feedback, or collaboration opportunities.
        </p>
      </article>
    </BriefSitePage>
  );
}
