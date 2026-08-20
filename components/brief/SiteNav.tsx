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
        className={`${brief.shell} flex items-center gap-3 py-2.5 sm:gap-6`}
      >
        {showLogo ? (
          <Link
            href="/"
            className="min-w-0 shrink transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7]"
          >
            <Image
              src="/stewardship-brief-logo.png"
              alt="The Stewardship Brief"
              width={1403}
              height={631}
              priority
              className="h-7 w-auto max-w-[102px] object-contain object-left sm:h-[34px] sm:max-w-[204px]"
            />
          </Link>
        ) : (
          <span className="flex-1" aria-hidden />
        )}

        <ul className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {LINKS.map((link) => {
            const isActive = active === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${brief.sans} inline-block border-b-2 px-2.5 py-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A79A7] sm:px-3 sm:text-[0.6875rem] sm:tracking-[0.12em] ${
                    isActive
                      ? "border-[#1C0B19] text-[#1C0B19]"
                      : "border-transparent text-[#72705B] hover:border-[#7BC1D4] hover:text-[#1C0B19]"
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
