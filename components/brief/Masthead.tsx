import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
};

/** Centered brand mark with date on the left — broadsheet masthead rhythm. */
export default function Masthead({ dateLabel }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div
        className={`${brief.shell} grid grid-cols-1 items-end gap-3 pt-3 pb-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:pt-4 sm:pb-4`}
      >
        <p
          className={`${brief.sans} order-2 text-center text-[0.6875rem] leading-snug text-[#72705B] sm:order-1 sm:justify-self-start sm:text-left sm:text-[0.75rem]`}
        >
          <span className="block font-medium tracking-[0.02em] text-[#1C0B19]">
            {dateLabel}
          </span>
          <span className="mt-0.5 block tracking-[0.04em]">
            Today&apos;s brief
          </span>
        </p>

        <div className="brief-masthead-settle order-1 flex w-full max-w-[520px] flex-col justify-self-center sm:order-2">
          <Image
            src="/stewardship-brief-logo.png"
            alt="The Stewardship Brief"
            width={1240}
            height={195}
            priority
            className="h-auto w-full max-h-[112px] object-contain object-right sm:max-h-[120px]"
          />
          <p
            className={`${brief.serif} mt-0.5 w-full text-right text-[0.75rem] font-medium italic leading-snug tracking-[-0.01em] text-[#1C0B19] sm:mt-1 sm:text-[0.85rem]`}
          >
            High Priority Antimicrobial Stewardship, Delivered Daily.
          </p>
        </div>

        <span className="order-3 hidden sm:block" aria-hidden />
      </div>

      <div className={brief.shell} aria-hidden>
        <div className="border-t border-[#1C0B19]" />
        <div className="mt-[3px] border-t border-[#1C0B19]" />
      </div>
    </header>
  );
}
