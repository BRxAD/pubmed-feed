/**
 * Run PubMed ingest against local dev or production.
 *
 * Local: npm run dev, then npm run ingest:now
 * Production: set NEXT_PUBLIC_APP_URL=https://pubmedfeed.vercel.app then npm run ingest:now
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEFAULT_TOPIC_NAME = "antimicrobial stewardship";

async function main() {
  console.log("Fetching topics from", `${BASE}/api/health/supabase`);
  const healthRes = await fetch(`${BASE}/api/health/supabase`);
  if (!healthRes.ok) {
    console.error("Health check failed:", healthRes.status, await healthRes.text());
    process.exit(1);
  }
  const health = (await healthRes.json()) as { ok?: boolean; topics?: { id: string; name: string }[] };
  if (!health.ok || !health.topics?.length) {
    console.error("No topics found. Ensure Supabase is set up and topics table has rows.");
    process.exit(1);
  }
  const topic = health.topics.find(
    (t) => t.name?.toLowerCase().includes(DEFAULT_TOPIC_NAME.toLowerCase())
  ) ?? health.topics[0];
  const topicId = topic.id;
  console.log("Using topic:", topic.name, "(" + topicId + ")");
  console.log("Triggering ingest...");
  const ingestRes = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId }),
  });
  const data = (await ingestRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; articles?: number; summarized?: number };
  if (!ingestRes.ok) {
    console.error("Ingest failed:", ingestRes.status, data.error ?? data);
    process.exit(1);
  }
  console.log("Ingest completed:", data);
}

main();
