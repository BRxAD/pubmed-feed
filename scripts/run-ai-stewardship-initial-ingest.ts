/**
 * One-time initial ingest for "Antimicrobial stewardship and artificial intelligence":
 * Jan 2024 to present (up to 500 articles). Run after adding the topic via add_ai_stewardship_topic.sql.
 *
 * Start the dev server first: npm run dev
 * Then: npx tsx scripts/run-ai-stewardship-initial-ingest.ts
 */

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const TOPIC_NAME = "Antimicrobial stewardship and artificial intelligence";

function todayYYYYMMDD(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

async function main() {
  console.log("Fetching topics from", `${APP_BASE_URL}/api/health/supabase`);
  const healthRes = await fetch(`${APP_BASE_URL}/api/health/supabase`);
  if (!healthRes.ok) {
    console.error("Health check failed:", healthRes.status, await healthRes.text());
    process.exit(1);
  }
  const health = (await healthRes.json()) as { ok?: boolean; topics?: { id: string; name: string }[] };
  if (!health.ok || !health.topics?.length) {
    console.error("No topics found.");
    process.exit(1);
  }
  const topic = health.topics.find(
    (t) => t.name?.toLowerCase().includes("antimicrobial stewardship") && t.name?.toLowerCase().includes("artificial intelligence")
  );
  if (!topic) {
    console.error(`Topic "${TOPIC_NAME}" not found. Run scripts/add_ai_stewardship_topic.sql in Supabase first.`);
    process.exit(1);
  }
  const mindate = "2024-01-01";
  const maxdate = todayYYYYMMDD();
  console.log("Topic:", topic.name, "(" + topic.id + ")");
  console.log("Date range:", mindate, "to", maxdate);
  console.log("Triggering ingest (may take several minutes)...");
  const ingestRes = await fetch(`${APP_BASE_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId: topic.id, mindate, maxdate }),
  });
  const data = (await ingestRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!ingestRes.ok) {
    console.error("Ingest failed:", ingestRes.status, data.error ?? data);
    process.exit(1);
  }
  console.log("Initial ingest completed:", data);
}

main();

export {};
