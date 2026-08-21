import "server-only";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export type SurveyPromptStatus = "deferred" | "done";

export type SurveyPromptRow = {
  ipHash: string;
  status: SurveyPromptStatus;
  showCount: number;
};

function surveyIpSalt(): string {
  return (
    process.env.SURVEY_IP_SALT?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.BRIEF_ADMIN_SECRET?.trim() ||
    "brief-survey-dev-salt"
  );
}

export function hashSurveyIp(ip: string): string {
  return createHash("sha256")
    .update(`${surveyIpSalt()}:${ip.trim()}`)
    .digest("hex");
}

/** Best-effort client IP behind Vercel / proxies. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export async function getSurveyPrompt(
  ipHash: string
): Promise<SurveyPromptRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_prompts")
    .select("ip_hash, status, show_count")
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (error) {
    // Table may not exist yet — caller falls back to client-only.
    console.warn("[survey] getSurveyPrompt", error.message);
    return null;
  }
  if (!data) return null;
  return {
    ipHash: data.ip_hash as string,
    status: data.status as SurveyPromptStatus,
    showCount: Number(data.show_count) || 0,
  };
}

/** Whether this IP may see the survey (max 2 impressions). */
export function surveyMayShow(row: SurveyPromptRow | null): boolean {
  if (!row) return true;
  if (row.status === "done") return false;
  if (row.showCount >= 2) return false;
  return true;
}

export async function recordSurveyShown(
  ipHash: string
): Promise<SurveyPromptRow | null> {
  const supabase = getSupabaseServerClient();
  const existing = await getSurveyPrompt(ipHash);
  const nextCount = (existing?.showCount ?? 0) + 1;
  const status: SurveyPromptStatus =
    existing?.status === "done" ? "done" : "deferred";

  const { data, error } = await supabase
    .from("survey_prompts")
    .upsert(
      {
        ip_hash: ipHash,
        status,
        show_count: Math.min(nextCount, 2),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ip_hash" }
    )
    .select("ip_hash, status, show_count")
    .single();

  if (error) {
    console.warn("[survey] recordSurveyShown", error.message);
    return null;
  }
  return {
    ipHash: data.ip_hash as string,
    status: data.status as SurveyPromptStatus,
    showCount: Number(data.show_count) || 0,
  };
}

export async function markSurveyDeferred(
  ipHash: string
): Promise<SurveyPromptRow | null> {
  const existing = await getSurveyPrompt(ipHash);
  const showCount = existing?.showCount ?? 1;
  const status: SurveyPromptStatus = showCount >= 2 ? "done" : "deferred";

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_prompts")
    .upsert(
      {
        ip_hash: ipHash,
        status,
        show_count: showCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ip_hash" }
    )
    .select("ip_hash, status, show_count")
    .single();

  if (error) {
    console.warn("[survey] markSurveyDeferred", error.message);
    return null;
  }
  return {
    ipHash: data.ip_hash as string,
    status: data.status as SurveyPromptStatus,
    showCount: Number(data.show_count) || 0,
  };
}

export async function markSurveyDone(ipHash: string): Promise<void> {
  const existing = await getSurveyPrompt(ipHash);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("survey_prompts").upsert(
    {
      ip_hash: ipHash,
      status: "done",
      show_count: Math.max(existing?.showCount ?? 1, 1),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ip_hash" }
  );
  if (error) console.warn("[survey] markSurveyDone", error.message);
}
