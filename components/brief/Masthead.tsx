"use client";

import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
};

export default function Masthead({ dateLabel }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 lg:px-8 text-center">
        <p className={`${brief.kicker} mb-4`}>Antimicrobial stewardship</p>
        <h1
          className={`${brief.serif} text-[2.75rem] sm:text-5xl font-bold tracking-tight leading-none`}
        >
          The Stewardship Brief
        </h1>
        <div className="mt-5 flex items-center justify-center gap-3">
          <span className="hidden sm:block h-px w-12 bg-[#d4cfc4]" />
          <p className={`${brief.sans} text-sm ${brief.muted}`}>{dateLabel}</p>
          <span className="hidden sm:block h-px w-12 bg-[#d4cfc4]" />
        </div>
        <nav
          className={`mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 ${brief.sans} text-xs uppercase tracking-[0.12em]`}
          aria-label="Section"
        >
          <a
            href="/stewardshipbrief"
            className={`${brief.accent} underline underline-offset-4 decoration-[#b0672e]/50`}
          >
            Today&apos;s brief
          </a>
          <a href="/feed?source=pubmed" className={`${brief.muted} ${brief.accentHover}`}>
            Full feed
          </a>
        </nav>
      </div>
      <div className={`mx-auto max-w-6xl border-b-2 ${brief.rule}`} />
    </header>
  );
}
