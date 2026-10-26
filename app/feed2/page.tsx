import FeedUnlock from "@/components/FeedUnlock";
import SecondRaterScore from "@/components/SecondRaterScore";
import { verifyFeed2Password } from "@/lib/brief/adminAuth";
import {
  ensureSecondRaterQueue,
  loadSecondRaterCards,
  secondRaterProgress,
} from "@/lib/brief/secondRater";
import { articleExternalUrl } from "@/lib/feedSource";
import { getDefaultTopicId } from "@/lib/feed";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const PAGE_SIZE = 20;

function formatDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function pageHref(secret: string, page: number, unratedOnly: boolean): string {
  const q = new URLSearchParams();
  q.set("secret", secret);
  if (page > 1) q.set("page", String(page));
  if (!unratedOnly) q.set("rated", "1");
  return `/feed2?${q.toString()}`;
}

export default async function Feed2Page({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string; page?: string; rated?: string }>;
}) {
  const params = await searchParams;
  const secret = params.secret?.trim() ?? "";
  if (!verifyFeed2Password(secret)) {
    return <FeedUnlock nextPath="/feed2" />;
  }

  const topicId = await getDefaultTopicId();
  if (!topicId) {
    return (
      <p className="mx-auto max-w-2xl px-4 py-10 text-zinc-400">
        No default topic found.
      </p>
    );
  }

  const supabase = getSupabaseServerClient();
  let queueError = "";
  try {
    await ensureSecondRaterQueue(supabase, topicId);
  } catch (err) {
    queueError = err instanceof Error ? err.message : "Could not load the queue.";
  }
  if (queueError) {
    return (
      <p className="mx-auto max-w-2xl px-4 py-10 text-red-300">{queueError}</p>
    );
  }

  const unratedOnly = params.rated !== "1";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const [{ total, rated }, { cards, matched }] = await Promise.all([
    secondRaterProgress(supabase, topicId),
    loadSecondRaterCards({
      supabase,
      topicId,
      page,
      pageSize: PAGE_SIZE,
      unratedOnly,
      articleUrl: (pmid, article) =>
        articleExternalUrl(
          pmid,
          article.source === "openalex" ? "openalex" : "pubmed",
          {
            doi: article.doi,
            landingUrl: article.landing_url,
            openalexId: article.openalex_id,
          }
        ),
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const left = total - rated;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
        Second rater
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Score these papers on your own
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        {rated} of {total} scored. {left} still open. A score of 5 or higher
        means you would include it. Your scores stay separate from the editor
        ratings and do not change the live feed.
      </p>
      <p className="mt-3 text-sm">
        {unratedOnly ? (
          <a className="text-sky-300 underline" href={pageHref(secret, 1, false)}>
            Show papers you already scored
          </a>
        ) : (
          <a className="text-sky-300 underline" href={pageHref(secret, 1, true)}>
            Back to unscored papers
          </a>
        )}
      </p>

      {cards.length === 0 ? (
        <p className="mt-8 text-zinc-300">
          {unratedOnly
            ? "Every paper in this set has a score."
            : "Nothing in this set."}
        </p>
      ) : (
        <ol className="mt-8 space-y-6">
          {cards.map((card) => (
            <li
              key={card.pmid}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4"
            >
              <p className="text-xs text-zinc-500">
                {card.position} of {total}
                {card.journal ? ` · ${card.journal}` : ""}
                {card.date ? ` · ${formatDate(card.date)}` : ""}
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-snug">
                <a
                  href={card.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-sky-300"
                >
                  {card.title}
                </a>
              </h2>
              {card.abstract ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {card.abstract}
                </p>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">No abstract stored.</p>
              )}
              <SecondRaterScore
                pmid={card.pmid}
                initialRating={card.rating}
                secret={secret}
              />
            </li>
          ))}
        </ol>
      )}

      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? (
            <a
              className="text-sky-300 underline"
              href={pageHref(secret, page - 1, unratedOnly)}
            >
              Previous
            </a>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <a
              className="text-sky-300 underline"
              href={pageHref(secret, page + 1, unratedOnly)}
            >
              Next
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
