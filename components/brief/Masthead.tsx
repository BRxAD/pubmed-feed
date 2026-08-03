import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
};

export default function Masthead({ dateLabel }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6 lg:px-8">
        <div className="brief-masthead-settle flex flex-col items-center text-center">
          <Image
            src="/stewardship-brief-logo.png"
            alt="The Stewardship Brief"
            width={1403}
            height={631}
            priority
            className="h-auto w-full max-w-[646px] max-h-[136px] object-contain object-center"
          />

          {/* Edition line — quiet steel accent borrowed from About */}
          <div className="mt-5 flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-[#7BC1D4] sm:w-12" aria-hidden />
            <p
              className={`${brief.sans} text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-[#2A79A7]`}
            >
              {dateLabel}
            </p>
            <span className="h-px w-8 bg-[#7BC1D4] sm:w-12" aria-hidden />
          </div>

        </div>
      </div>

      {/* Steel hairline over plum rule — ties home to About without a hero band */}
      <div className="mx-auto max-w-6xl">
        <div className="h-px bg-[#7BC1D4]/55" aria-hidden />
        <div className={`border-b-2 ${brief.rule}`} />
      </div>
    </header>
  );
}
