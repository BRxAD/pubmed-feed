"use client";

import { useBriefSaved } from "@/components/brief/SaveStreak";
import { brief } from "@/components/brief/briefTheme";

export default function AccountSavedArticles() {
  const { savedItems, toggleSave, savedCount } = useBriefSaved();

  return (
    <section className="border-t border-[#D8D4C8] pt-10">
      <h2 className={`${brief.kicker} mb-2`}>Saved articles</h2>
      <p className={`mb-4 ${brief.sans} text-sm ${brief.muted}`}>
        These stay with your account while you are signed in. You can also open
        them from Your brief on the homepage.
      </p>
      {savedCount === 0 ? (
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          Nothing saved yet. On the daily brief, tap Save on a story.
        </p>
      ) : (
        <ul className="space-y-2">
          {savedItems.map((item) => (
            <li key={item.pmid} className="flex items-start gap-3">
              <a
                href={item.pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-w-0 flex-1 ${brief.sans} text-sm leading-snug ${brief.ink} hover:text-[#2A79A7]`}
              >
                {item.title}
              </a>
              <button
                type="button"
                onClick={() => toggleSave(item.pmid)}
                className={`${brief.sans} text-xs ${brief.muted} hover:text-[#1C0B19]`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
