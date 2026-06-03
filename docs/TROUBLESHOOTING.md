# Troubleshooting

## "Error connect refused" (ECONNREFUSED)

This usually means something is trying to connect to a host/port where nothing is listening.

### If you see it when running ingest scripts

The scripts (`run-ingest-now.ts`, `run-ai-stewardship-initial-ingest.ts`) call your **Next.js app** at `http://localhost:3000`. So:

1. **Start the dev server first** in one terminal:
   ```bash
   npm run dev
   ```
2. Wait until you see "Ready" and the app is listening on port 3000.
3. In **another** terminal run the ingest:
   ```bash
   npx tsx scripts/run-ingest-now.ts
   ```
   or
   ```bash
   npm run ingest:now
   ```

If the dev server runs on a different port (e.g. 3001), set:

```bash
set NEXT_PUBLIC_APP_URL=http://localhost:3001
npx tsx scripts/run-ingest-now.ts
```

(On macOS/Linux use `export NEXT_PUBLIC_APP_URL=http://localhost:3001`.)

### If you see it when opening the site or calling API routes

Then the app is running but **Supabase** is unreachable. Common causes:

1. **Wrong or missing env**
   - In project root, ensure `.env.local` has:
     - `SUPABASE_URL` = your project URL (e.g. `https://xxxx.supabase.co`)
     - `SUPABASE_SERVICE_ROLE_KEY` = the service role key from Supabase Dashboard → Settings → API
   - No quotes, no trailing slash on the URL.

2. **Using local Supabase**  
   If `SUPABASE_URL` points to `http://127.0.0.1:54321` (or similar), the Supabase stack must be running (e.g. `supabase start`). Otherwise use the hosted project URL.

3. **Network / firewall**  
   Something blocking outbound HTTPS to `*.supabase.co`. Try opening `https://your-project.supabase.co` in a browser.

After fixing env or network, restart the dev server (`npm run dev`).
