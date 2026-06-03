# Deploy pubmed-feed to Vercel

## 1. Push your code to Git

If you haven’t already, create a repo (GitHub, GitLab, or Bitbucket) and push your project:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pubmed-feed.git
git push -u origin main
```

(Use your real repo URL and branch name.)

## 2. Import the project in Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New…** → **Project**.
3. Import your Git repository (e.g. `pubmed-feed`).
4. Leave **Framework Preset** as **Next.js** and **Root Directory** as `.`.
5. Do **not** deploy yet—add environment variables first.

## 3. Set environment variables

In the Vercel project, go to **Settings** → **Environment Variables** and add these for **Production** (and optionally Preview):

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From Supabase Dashboard → Settings → API → service_role |
| `OPENAI_API_KEY` | Yes | For summaries and study classification |
| `NCBI_EMAIL` | Recommended | NCBI asks for contact email (e.g. your email) |
| `NCBI_API_KEY` | Optional | Speeds up PubMed; get from NCBI account |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Same as `SUPABASE_URL` if the ingest route should use it |
| `NEXT_PUBLIC_APP_URL` | Recommended | e.g. `https://pubmedfeed.vercel.app` (cron/scripts) |
| `OPENALEX_MAILTO` | For OpenAlex | Your email (required by OpenAlex) |
| `OPENALEX_API_KEY` | For OpenAlex | API key from openalex.org — see `docs/OPENALEX_SETUP.md` |

**Do not** commit `.env.local` or any file containing real keys. Set everything in Vercel (or use Vercel’s env UI).

## 4. Deploy

1. Click **Deploy** (or push a new commit after linking the repo).
2. Wait for the build to finish. The first deployment will use the env vars you added.

Your app will be at `https://your-project.vercel.app` (or your custom domain). This project is deployed at **https://pubmedfeed.vercel.app**.

## 5. Test changes on production (preview or production)

You do not need to stay on `localhost` to try feed changes.

1. **Push a branch** — Vercel creates a **Preview** deployment per push (same env vars as Production unless you scoped them differently).
2. **Open the feed** on that deployment:
   - Production: `https://pubmedfeed.vercel.app/feed`
   - OpenAlex: `https://pubmedfeed.vercel.app/feed?source=openalex`
   - Preview: use the deployment URL from the Vercel dashboard (e.g. `https://pubmed-feed-git-<branch>-<team>.vercel.app/feed`).
3. **Trigger ingest on production** (after env vars are set):
   - PubMed: `curl -X POST "https://pubmedfeed.vercel.app/api/ingest?topicName=main"`
   - OpenAlex: `curl -X POST "https://pubmedfeed.vercel.app/api/ingest/openalex?topicName=main&summarize=1"`
4. **Local dev against production APIs** (optional): set `NEXT_PUBLIC_APP_URL=https://pubmedfeed.vercel.app` and run `npx tsx scripts/run-openalex-ingest-now.ts` to hit the live ingest route without deploying UI changes.

Redeploy is automatic when you push to the linked Git branch; allow ~1–2 minutes for the build.

## 6. Ingest on Hobby (no cron, 10s limit)

On **Vercel Hobby**:

- **Cron does not run** (cron is a Pro feature). The `vercel.json` cron is ignored.
- **Function limit is 10 seconds.** The ingest route is set to `maxDuration = 10` and fetches up to **20 articles** per run so it can finish in time.

**Trigger ingest manually** when you want new articles:

- Browser: `https://your-project.vercel.app/api/ingest?topicName=main&daysBack=7`
- Or: `curl "https://your-project.vercel.app/api/ingest?topicName=main&daysBack=7"`

Run it every few days or weekly. For larger backfills (e.g. 500 articles, 1 year), call the **production** ingest URL with `daysBack=365` if your Vercel plan allows long enough functions (`maxDuration` is 300s on the ingest routes), or run `npm run dev` locally and ingest into the same Supabase project.

## 7. If you upgrade to Pro later

On **Vercel Pro** you can: increase `maxDuration` to 60 in `app/api/ingest/route.ts`, raise the ingest batch size (e.g. 500), and use the cron in `vercel.json` for daily ingest.

## 8. Optional: protect the ingest endpoint

If you don’t want the ingest URL to be callable by anyone, add a secret and check it in the route (e.g. require `?secret=YOUR_CRON_SECRET` or an `Authorization` header). Then set `CRON_SECRET` in Vercel and use the same value in your cron or manual calls.

## Quick checklist (Hobby)

- [ ] Code pushed to GitHub/GitLab/Bitbucket  
- [ ] Project imported in Vercel  
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set  
- [ ] `OPENAI_API_KEY` set  
- [ ] `NCBI_EMAIL` set (recommended)  
- [ ] Deploy triggered and build succeeded  
- [ ] Trigger ingest manually when needed (cron doesn’t run on Hobby)
