import type { ReactNode } from "react";
import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  dateLabel: string;
  /** Guest email-signup card — desktop right column + mobile strip below the rules. */
  aside?: ReactNode;
};

/** Centered brand mark with date on the left — broadsheet masthead rhythm. */
export default function Masthead({ dateLabel, aside }: Props) {
  return (
    <header className={`${brief.bg} ${brief.ink}`}>
      <div
        className={`${brief.shell} grid grid-cols-1 items-end gap-3 pt-3 pb-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:pt-4 sm:pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)_minmax(15rem,1fr)]`}
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

        <a
          href="/"
          className="brief-masthead-settle order-1 flex w-full max-w-[520px] flex-col justify-self-center transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] sm:order-2"
        >
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
        </a>

        <div className="order-3 hidden min-w-0 lg:block lg:max-w-[260px] lg:justify-self-end empty:hidden">
          {aside}
        </div>
      </div>

      <div className={brief.shell} aria-hidden>
        <div className="border-t border-[#1C0B19]" />
        <div className="mt-[3px] border-t border-[#1C0B19]" />
      </div>

      {aside ? (
        <div className={`${brief.shell} pt-3 empty:hidden lg:hidden`}>
          {aside}
        </div>
      ) : null}
    </header>
  );
}
