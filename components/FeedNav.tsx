/**
 * Tab navigation bar shared across feed pages.
 * The Stewardship Brief is the primary product surface.
 */

type FeedTab = {
  id: string;
  label: string;
  href: string;
  description: string;
};

const FEED_TABS: FeedTab[] = [
  {
    id: "brief",
    label: "The Brief",
    href: "/",
    description: "Daily priority briefing — PubMed",
  },
  {
    id: "main",
    label: "Full feed",
    href: "/feed",
    description: "Antimicrobial stewardship (all summaries)",
  },
];

export default function FeedNav({ activeId }: { activeId: string }) {
  return (
    <nav
      aria-label="Feed navigation"
      className="flex items-end gap-1 border-b border-zinc-200 dark:border-zinc-700/60"
    >
      {FEED_TABS.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <a
            key={tab.id}
            href={tab.href}
            title={tab.description}
            aria-current={isActive ? "page" : undefined}
            className={`group relative -mb-px inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-b-2 border-transparent text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
