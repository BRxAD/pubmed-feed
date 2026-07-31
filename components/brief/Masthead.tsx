import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
};

export default function Masthead({ dateLabel }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/stewardship-brief-logo.png"
            alt="The Stewardship Brief"
            width={1024}
            height={160}
            priority
            className="h-auto w-full max-w-[720px] max-h-[120px] object-contain object-center"
          />
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="hidden sm:block h-px w-12 bg-[#D8D4C8]" />
            <p className={`${brief.sans} text-sm ${brief.muted}`}>{dateLabel}</p>
            <span className="hidden sm:block h-px w-12 bg-[#D8D4C8]" />
          </div>
        </div>
      </div>
      <div className={`mx-auto max-w-6xl border-b-2 ${brief.rule}`} />
    </header>
  );
}
