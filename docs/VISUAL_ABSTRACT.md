# Visual abstract (beta)

A picture of one paper's main results, made from its abstract. It replaces the **Graphic takeaway** button. Same dialog, same Download and Share.

## The rules

- **Only when a signed-in reader clicks.** Never at ingest, never when a page loads, never in the email, never for a crawler. It is a POST behind a button.
- **Signed-in readers only.** A signed-out reader sees "Sign in to make a visual abstract" and can use the text graphic instead.
- **Beta.** The words "(beta)" sit next to "Visual abstract" on the button, the Share menu and the dialog title.
- **One look:** Stewardship Brief, 16:9, 1600 x 900.
- **Always an exit.** If it cannot be made, the dialog says so in one plain sentence and offers the text graphic. That graphic is the old canvas one, unchanged.
- **Papers without a PubMed ID** (OpenAlex-only rows) keep the old "Graphic takeaway" button.
- Author-outreach links (`/article/<pmid>?takeaway=1`) still open the dialog. A signed-out author sees the sign-in panel with "Use the text graphic instead".

## How it works

1. A click calls `POST /api/brief/visual-abstract` with the PMID. The route checks the sign-in, then replies at once.
2. If the paper already has a picture, the reply is its address (free). If not, one row is created (`visual_abstracts`, one per paper) and the work continues after the reply: the Visual Abstract service reads the abstract, pubmed-feed saves the findings, the service draws the picture, the picture goes to the `visual-abstracts` storage bucket.
3. The open dialog asks `GET /api/brief/visual-abstract?pmid=` every 2.5 seconds. That check also rescues a paper whose worker died (findings saved but not drawn are drawn; a row quiet for 200 seconds is marked failed). There is **no cron**: the Hobby plan allows one run a day.
4. Several people clicking the same new paper start one job.

Code: `lib/brief/visualAbstract/` (`pipeline.ts` is the state machine; `store.ts` is the only file that touches Supabase), `app/api/brief/visual-abstract/route.ts`, `components/brief/VisualAbstractButton.tsx`.

## Limits that keep cost and egress small

| Limit | Default | Setting |
|---|---|---|
| New papers one person may start per hour | 5 | `VISUAL_ABSTRACT_USER_PER_HOUR` |
| New papers started per day, everyone | 40 (about $2) | `VISUAL_ABSTRACT_PER_DAY` |
| Attempts on one paper (each may be a paid model call), then it stops | 3 | built in |
| A paper the maker cannot draw (no abstract, no numbers, will not fit) | not retried | built in |

Repeat clicks cost nothing and do not count. A retry after a drawing or saving failure keeps the findings it already paid for and only draws again. Only papers in the `articles` table can be made.

Egress: a picture is about 150 KB from the storage CDN; the findings (about 15 KB) are read for one paper at a time, never in bulk, never on page load.

## Set it up (once)

1. **Supabase SQL Editor:** run `scripts/add_visual_abstracts.sql` (table, indexes, public `visual-abstracts` bucket).
2. **Deploy the Visual Abstract service** (see that project's `docs/visual-abstract-service.md`). It needs its own OpenAI key with a monthly budget limit.
3. **Vercel env for this project:**

| Variable | Value |
|---|---|
| `VISUAL_ABSTRACT_URL` | the service's production address, e.g. `https://visual-abstract.vercel.app` |
| `VISUAL_ABSTRACT_KEY` | one of the service's `VISUAL_ABSTRACT_SERVICE_KEYS` |
| `VISUAL_ABSTRACT_ENABLED` | optional. `0` switches the feature off at once (the dialog offers the text graphic) |
| `VISUAL_ABSTRACT_USER_PER_HOUR`, `VISUAL_ABSTRACT_PER_DAY` | optional, see above |

4. Redeploy, sign in, click **Visual abstract (beta)** on a paper.

Until step 3 is done the button still works: it shows "not switched on yet" and offers the text graphic.

## Running it

- **Switch off:** `VISUAL_ABSTRACT_ENABLED=0`, redeploy.
- **See what happened:** `select pmid, status, error_code, attempts, cost_usd, requested_at from visual_abstracts order by requested_at desc limit 50;` (Vercel keeps only an hour of logs on Hobby, so the reasons live here.)
- **Make a paper again** (after a prompt improvement, say): `delete from visual_abstracts where pmid = '40123456';` Its next click makes a new one. Pictures are not regenerated unless asked.
- **Spend:** `select sum(cost_usd) from visual_abstracts where requested_at > now() - interval '30 days';`
- **Rollback to the old button:** in `ArticleCard.tsx` and `ArticlePermalinkView.tsx` swap `VisualAbstractButton` back to `GraphicTakeawayButton` (that file is unchanged).

## Tests

`npm test` (`lib/brief/visualAbstract/pipeline.test.ts`) covers the state machine with a fake service and an in-memory store: one winner per paper, the limits, every failure, a dead worker, the key staying on the server. The Supabase store follows the same rules with single conditional updates.
