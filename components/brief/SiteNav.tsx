import Link from "next/link";
import { brief } from "@/components/brief/briefTheme";

const LINKS = [
  { href: "/", label: "Daily brief" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

type Props = {
  /** Current path so the active link is marked. */
  active?: "/" | "/about" | "/contact";
  /** Show the serif wordmark on the left (off on the brief, which has a masthead). */
  wordmark?: boolean;
};

export default function SiteNav({ active, wordmark = true }: Props) {
  return (
    <div className="sticky top-0 z-40 border-b border-[#D8D4C8] bg-[#F6F4EF]/90 backdrop-blur-md">
      <nav
        aria-label="Site"
        className={`mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-8 ${
          wordmark ? "justify-between" : "justify-center"
        }`}
      >
        {wordmark && (
          <Link
            href="/"
            className={`${brief.serif} text-[0.9375rem] font-semibold tracking-tight text-[#1C0B19] transition-opacity hover:opacity-70`}
          >
            The Stewardship Brief
          </Link>
        )}

        <ul className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const isActive = active === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${brief.sans} inline-block rounded-full px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.12em] transition-colors ${
                    isActive
                      ? "bg-[#1C0B19] text-[#F6F4EF]"
                      : "text-[#72705B] hover:bg-[#7BC1D4]/25 hover:text-[#1C0B19]"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
