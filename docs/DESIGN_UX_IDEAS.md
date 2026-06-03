# Design & UX ideas to improve usability and keep interest

Quick reference for future improvements. Some are already partly in place (e.g. result count, hover on cards, color-coded keywords).

---

## Already in place
- **Result count** – “N articles” above the list so users see scope at a glance.
- **Card hover** – Slight shadow lift on article cards (`hover:shadow-md`).
- **Color-coded keywords** – Same palette for trending sidebar and article chips; consistent per keyword.
- **Relevance score label** – Small “Relevance score” text next to the bar.
- **JIF helper text** – Note when min JIF &gt; 0 that only articles with JIF data are shown.

---

## Quick wins
1. **Active filter pills** – When keyword or min JIF is set, show a small pill (e.g. “Keyword: X” / “JIF ≥ 5”) with a × to clear that filter, next to or inside the toolbar.
2. **“Back to top”** – After a long list, a small floating or sticky “Back to top” link/button.
3. **Publication date relative** – Besides the raw date, show “2 weeks ago” or “Last month” in muted text.
4. **External link icon** – Small icon next to the title to show it opens PubMed in a new tab.

---

## Engagement and fun
1. **Weekly digest teaser** – One line under the header: “X new articles this week” (from ingest stats or count of items created in last 7 days).
2. **Light micro-animations** – Card enter (e.g. subtle fade-in or slide-up) when the list loads; keep them short and optional (respect `prefers-reduced-motion`).
3. **Theme toggle** – Explicit light/dark switch in the header so users can choose; keep system preference as default.
4. **Keyword “trending” badge** – In the sidebar, a small “↑” or “Trending” for keywords that went up vs last period (needs a simple trend metric).
5. **Empty state illustration** – When there are no results, a simple SVG or image instead of plain text to make the state feel less harsh.
6. **Share / copy link** – “Copy link to this view” (with current filters and sort) so users can share a filtered feed.

---

## Clarity and trust
1. **Last updated** – “Feed updated: [date]” or “Articles through [date]” so users know how fresh the data is.
2. **What JIF is** – Tooltip or short help next to “Journal Impact Factor”: “JIF 2024 from Clarivate; only shown when we have data.”
3. **Study type tooltip** – Optional short definition on hover for the study label (e.g. from taxonomy) so “Before After Pre Post Study” is self-explanatory.

---

## Technical notes
- **JIF data** – JIF comes from the `journal_metrics` table (matched by normalized journal name). If min JIF &gt; 0 returns no articles, check that `journal_metrics` is populated and that `journal_name` matches the normalized names from article data (e.g. run a quick query in Supabase to compare).
- **Slider value** – The JIF slider value is submitted with the form on “Apply” and read from the URL (`minJif`). The number shown next to the slider reflects the current filter from the URL.
