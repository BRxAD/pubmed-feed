import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  kicker: string;
  title: string;
  lede?: string;
  /** Omit for a typographic band with no photography. */
  image?: { url: string; alt: string };
  children?: React.ReactNode;
};

const MESH =
  "radial-gradient(ellipse 60% 80% at 8% 0%, rgba(42,121,167,0.55), transparent 60%), radial-gradient(ellipse 45% 60% at 45% 110%, rgba(123,193,212,0.28), transparent 60%), radial-gradient(ellipse 40% 50% at 85% 0%, rgba(255,166,158,0.18), transparent 60%)";

export default function PageHero({
  kicker,
  title,
  lede,
  image,
  children,
}: Props) {
  return (
    <section className="relative isolate overflow-hidden bg-[#1C0B19]">
      <div className="absolute inset-0" aria-hidden style={{ background: MESH }} />

      {image && (
        <div className="relative h-56 w-full sm:h-72 xl:absolute xl:inset-y-0 xl:right-0 xl:h-full xl:w-[42%]">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 42vw"
            className="object-cover"
          />
          {/* Blend the photo edge into the plum panel. */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#1C0B19] via-[#1C0B19]/25 to-transparent xl:bg-gradient-to-r xl:from-[#1C0B19] xl:via-[#1C0B19]/20 xl:to-transparent"
            aria-hidden
          />
        </div>
      )}

      <div
        className={`relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${
          image
            ? "py-14 sm:py-16 lg:py-20 xl:py-28 xl:pr-[46%]"
            : "py-16 sm:py-20 lg:py-24"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-[#7BC1D4]" aria-hidden />
          <p
            className={`${brief.sans} text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-[#7BC1D4]`}
          >
            {kicker}
          </p>
        </div>

        <h1
          className={`${brief.serif} mt-5 max-w-3xl text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.025em] text-[#F6F4EF] sm:text-5xl xl:text-[3.5rem]`}
        >
          {title}
        </h1>

        {lede && (
          <p
            className={`${brief.sans} mt-6 max-w-xl text-base leading-[1.7] text-[#F6F4EF]/80 sm:text-[1.0625rem]`}
          >
            {lede}
          </p>
        )}

        {children}
      </div>
    </section>
  );
}
