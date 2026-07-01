"use client";

import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
  editorsNote: string;
  newSinceYesterday: number;
};

export default function Masthead({
  dateLabel,
  editorsNote,
  newSinceYesterday,
}: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink} border-b-2 ${brief.rule}`}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 text-center">
        <p className={`${brief.kicker} mb-3`}>
          Antimicrobial stewardship · PubMed
        </p>
        <h1
          className={`${brief.serif} text-4xl sm:text-5xl font-bold tracking-tight`}
        >
          The Stewardship Brief
        </h1>
        <p className={`mt-3 ${brief.sans} text-sm ${brief.muted}`}>
          {dateLabel}
        </p>
        {newSinceYesterday > 0 && (
          <p className={`mt-4 inline-block ${brief.kicker}`}>
            {newSinceYesterday} new since yesterday
          </p>
        )}
        <p
          className={`mt-6 max-w-2xl mx-auto ${brief.serif} text-lg italic leading-relaxed ${brief.ink}`}
        >
          {editorsNote}
        </p>
        <nav
          className={`mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 ${brief.sans} text-xs uppercase tracking-[0.12em]`}
          aria-label="Section"
        >
          <a href="/stewardshipbrief" className={`${brief.accent} underline underline-offset-4`}>
            Today&apos;s brief
          </a>
          <a href="/feed?source=pubmed" className={`${brief.muted} ${brief.accentHover}`}>
            Full feed
          </a>
        </nav>
      </div>
    </header>
  );
}
