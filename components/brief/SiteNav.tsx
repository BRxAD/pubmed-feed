import Link from "next/link";
import Image from "next/image";
import { brief } from "@/components/brief/briefTheme";

const LINKS = [
  { href: "/", label: "Daily brief", shortLabel: "Brief" },
  { href: "/about", label: "About", shortLabel: "About" },
  { href: "/contact", label: "Contact", shortLabel: "Contact" },
] as const;

type Props = {
  /** Current path so the active link is marked. */
  active?: "/" | "/about" | "/contact";
  /** Hide on the brief page — masthead already shows the brand. */
  showLogo?: boolean;
};

export default function SiteNav({ active, showLogo = true }: Props) {
  return (
    <div className="sticky top-0 z-40 border-b border-[#D8D4C8] bg-[#F6F4EF]/90 backdrop-blur-md">
      <nav
        aria-label="Site"
        className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-6 sm:px-6 lg:px-8"
      >
        {showLogo ? (
          <Link
            href="/"
            className="min-w-0 shrink transition-opacity hover:opacity-80"
          >
            <Image
              src="/stewardship-brief-logo.png"
              alt="The Stewardship Brief"
              width={1403}
              height={631}
              priority
              className="h-8 w-auto max-w-[120px] object-contain object-left sm:h-10 sm:max-w-[240px]"
            />
          </Link>
        ) : (
          <span className="flex-1" aria-hidden />
        )}

        <ul className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
          {LINKS.map((link) => {
            const isActive = active === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${brief.sans} inline-block rounded-full px-2.5 py-1.5 text-[0.625rem] font-medium uppercase tracking-[0.1em] transition-colors sm:px-3 sm:text-[0.6875rem] sm:tracking-[0.12em] ${
                    isActive
                      ? "bg-[#1C0B19] text-[#F6F4EF]"
                      : "text-[#72705B] hover:bg-[#7BC1D4]/25 hover:text-[#1C0B19]"
                  }`}
                >
                  <span className="sm:hidden">{link.shortLabel}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
