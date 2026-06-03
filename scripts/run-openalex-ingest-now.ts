/**
 * Trigger OpenAlex ingest against local dev or production.
 *
 * Local (dev server running):
 *   npx tsx scripts/run-openalex-ingest-now.ts
 *
 * Production (Vercel):
 *   NEXT_PUBLIC_APP_URL=https://pubmedfeed.vercel.app npx tsx scripts/run-openalex-ingest-now.ts
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function main() {
  const url = `${BASE}/api/ingest/openalex?topicName=main&summarize=1&maxSummaries=5`;
  console.log("POST", url);
  const res = await fetch(url, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Ingest failed:", res.status, data);
    process.exit(1);
  }
  console.log("OpenAlex ingest completed:", JSON.stringify(data, null, 2));
}

main();
