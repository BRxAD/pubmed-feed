import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  kicker: string;
  title: string;
  lede?: string;
  imageUrl: string;
  imageAlt: string;
  /** Shorter band for secondary pages. */
  size?: "tall" | "short";
};

export default function PageHero({
  kicker,
  title,
  lede,
  imageUrl,
  imageAlt,
  size = "tall",
}: Props) {
  const height =
    size === "tall"
      ? "h-[26rem] sm:h-[32rem]"
      : "h-[18rem] sm:h-[22rem]";

  return (
    <section className={`relative isolate w-full overflow-hidden ${height}`}>
      <Image
        src={imageUrl}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Layered scrims keep headline contrast on any crop. */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(180deg, rgba(28,11,25,0.55) 0%, rgba(28,11,25,0.62) 45%, rgba(28,11,25,0.86) 100%)",
        }}
      />
      <div
        className="absolute inset-0 mix-blend-soft-light"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 20% 20%, rgba(123,193,212,0.45), transparent 60%)",
        }}
      />

      <div className="relative flex h-full items-end">
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="h-px w-10 bg-[#7BC1D4]" aria-hidden />
            <p
              className={`${brief.sans} text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-[#7BC1D4]`}
            >
              {kicker}
            </p>
          </div>
          <h1
            className={`${brief.serif} mt-4 max-w-3xl text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.02em] text-[#F6F4EF] sm:text-6xl`}
          >
            {title}
          </h1>
          {lede && (
            <p
              className={`${brief.sans} mt-6 max-w-2xl text-base leading-[1.65] text-[#F6F4EF]/85 sm:text-lg`}
            >
              {lede}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
