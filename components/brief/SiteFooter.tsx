import Link from "next/link";
import { brief } from "@/components/brief/briefTheme";

const EXPLORE = [
  { href: "/", label: "Daily brief" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export default function SiteFooter() {
  return (
    <footer className={`mt-24 border-t-2 ${brief.rule} bg-[#EFECE4]/60`}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div>
            <p
              className={`${brief.serif} text-lg font-semibold tracking-tight`}
            >
              The Stewardship Brief
            </p>
            <p
              className={`mt-3 max-w-sm ${brief.sans} text-sm leading-relaxed ${brief.muted}`}
            >
              AI-assisted intake, summary, classification, and ranking of new
              antimicrobial stewardship research.
            </p>
          </div>

          <nav aria-label="Explore">
            <p className={`${brief.meta} mb-3`}>Explore</p>
            <ul className="space-y-2">
              {EXPLORE.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`${brief.sans} text-sm text-[#1C0B19]/80 transition-colors hover:text-[#2A79A7]`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className={`${brief.meta} mb-3`}>Get in touch</p>
            <p
              className={`${brief.sans} text-sm leading-relaxed ${brief.muted}`}
            >
              Feedback, questions, or collaboration.
            </p>
            <Link
              href="/contact"
              className={`mt-3 inline-block ${brief.action}`}
            >
              Contact us →
            </Link>
          </div>
        </div>

        <div
          className={`mt-12 flex flex-col gap-2 border-t ${brief.hairline} pt-6 sm:flex-row sm:items-center sm:justify-between`}
        >
          <p className={`${brief.sans} text-xs ${brief.muted}`}>
            © {new Date().getFullYear()} The Stewardship Brief
          </p>
          <p className={`${brief.sans} text-xs ${brief.muted}`}>
            Developed by Bradley J. Langford, PharmD, MPH
          </p>
        </div>
      </div>
    </footer>
  );
}
