import Link from "next/link";
import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  children: React.ReactNode;
  title: string;
  kicker?: string;
};

/** Shared chrome for static Brief pages (About, Contact). */
export default function BriefSitePage({
  children,
  title,
  kicker = "The Stewardship Brief",
}: Props) {
  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(123,193,212,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(255,166,158,0.14), transparent 50%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl px-5 pt-10 pb-16 sm:px-6">
        <header className="mb-12 text-center">
          <Link href="/" className="inline-block">
            <Image
              src="/stewardship-brief-logo.png"
              alt="The Stewardship Brief"
              width={1403}
              height={631}
              priority
              className="mx-auto h-auto w-full max-w-[420px] max-h-[96px] object-contain"
            />
          </Link>
          <p className={`${brief.kicker} mt-6`}>{kicker}</p>
          <h1
            className={`${brief.serif} mt-2 text-3xl sm:text-4xl font-semibold tracking-tight`}
          >
            {title}
          </h1>
        </header>

        <main>{children}</main>

        <footer
          className={`mt-16 pt-8 border-t ${brief.hairline} flex flex-wrap items-center justify-center gap-x-6 gap-y-2`}
        >
          <Link href="/" className={brief.action}>
            Daily brief
          </Link>
          <Link href="/about" className={brief.action}>
            About
          </Link>
          <Link href="/contact" className={brief.action}>
            Contact
          </Link>
        </footer>
      </div>
    </div>
  );
}
