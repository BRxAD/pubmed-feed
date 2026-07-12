"use client";

import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
};

export default function Masthead({ dateLabel }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-6xl px-4 pt-1 pb-2 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center -space-y-1">
          <Image
            src="/stewardship-brief-logo.png"
            alt="The Stewardship Brief"
            width={1403}
            height={631}
            priority
            className="h-auto w-full max-w-[720px] max-h-[140px] object-contain object-center"
          />
          <div className="mt-1 flex items-center justify-center gap-3">
            <span className="hidden sm:block h-px w-12 bg-[#D8D4C8]" />
            <p className={`${brief.sans} text-sm ${brief.muted}`}>{dateLabel}</p>
            <span className="hidden sm:block h-px w-12 bg-[#D8D4C8]" />
          </div>
          <nav
            className={`mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2 ${brief.sans} text-xs uppercase tracking-[0.12em]`}
            aria-label="Section"
          >
            <a
              href="/stewardshipbrief"
              className={`${brief.accent} underline underline-offset-4 decoration-[#2A79A7]/40`}
            >
              Today&apos;s brief
            </a>
            <a
              href="/feed?source=pubmed"
              className={`${brief.muted} ${brief.accentHover}`}
            >
              Full feed
            </a>
          </nav>
        </div>
      </div>
      <div className={`mx-auto max-w-6xl border-b-2 ${brief.rule}`} />
    </header>
  );
}
