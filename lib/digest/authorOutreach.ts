import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchPubMedRecords } from "@/lib/pubmed/efetch";
import { publicAppBaseUrl } from "@/lib/internalFetch";
import { formatJournalTitle } from "@/lib/brief/formatJournal";
import { sendDigestEmail } from "@/lib/digest/sendEmail";
import { getBriefDigestFromAddress } from "@/lib/digest/config";
import {
  buildAuthorOutreachEmail,
  AUTHOR_OUTREACH_SUBJECT,
} from "@/lib/digest/authorOutreachFormat";
import {
  authorOutreachOptOutApiUrl,
  authorOutreachOptOutPageUrl,
} from "@/lib/digest/authorOutreachToken";
import type {
  AuthorOutreachRow,
  AuthorOutreachStatus,
} from "@/lib/digest/authorOutreachTypes";

export type { AuthorOutreachRow, AuthorOutreachStatus } from "@/lib/digest/authorOutreachTypes";

export const AUTHOR_OUTREACH_NIGHTLY_CAP = 25;

const TERMINAL_NO_REQUEUE: AuthorOutreachStatus[] = [
  "sent",
  "held",
  "never",
  "skipped_optout",
  "skipped_no_email",
];

function isMissingTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("author_outreach") || m.includes("corresponding_author");
}

function articleUrlForPmid(pmid: string): string {
  return `${publicAppBaseUrl()}/article/${pmid}`;
}

type ArticleCorrRow = {
  pmid: string;
  title?: string | null;
  journal?: string | null;
  corresponding_author_email?: string | null;
  corresponding_author_name?: string | null;
};

async function loadArticleCorr(
  pmid: string
): Promise<ArticleCorrRow | null> {
  const supabase = getSupabaseServerClient();
  const withCorr = await supabase
    .from("articles")
    .select(
      "pmid, title, journal, corresponding_author_email, corresponding_author_name"
    )
    .eq("pmid", pmid)
    .maybeSingle();
  if (!withCorr.error && withCorr.data) {
    return withCorr.data as ArticleCorrRow;
  }
  if (withCorr.error && isMissingTable(withCorr.error.message)) {
    const fallback = await supabase
      .from("articles")
      .select("pmid, title, journal")
      .eq("pmid", pmid)
      .maybeSingle();
    if (fallback.data) return fallback.data as ArticleCorrRow;
  }
  return null;
}

async function loadHeadline(pmid: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("summaries")
    .select("headline")
    .eq("pmid", pmid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const headline = (data as { headline?: string | null } | null)?.headline;
  return headline?.trim() || null;
}

async function persistCorrespondingAuthor(
  pmid: string,
  email: string | null,
  name: string | null
): Promise<void> {
  if (!email && !name) return;
  const supabase = getSupabaseServerClient();
  const patch: Record<string, string> = {};
  if (email) patch.corresponding_author_email = email;
  if (name) patch.corresponding_author_name = name;
  const { error } = await supabase.from("articles").update(patch).eq("pmid", pmid);
  if (error && !isMissingTable(error.message)) {
    console.warn("[authorOutreach] article email save failed:", error.message);
  }
}

/** One PMID EFetch when ingest did not store an email. */
export async function resolveCorrespondingAuthor(pmid: string): Promise<{
  email: string | null;
  name: string | null;
  title: string | null;
  journal: string | null;
}> {
  const existing = await loadArticleCorr(pmid);
  const storedEmail = existing?.corresponding_author_email?.trim() || null;
  const storedName = existing?.corresponding_author_name?.trim() || null;
  if (storedEmail) {
    return {
      email: storedEmail.toLowerCase(),
      name: storedName,
      title: existing?.title ?? null,
      journal: existing?.journal ?? null,
    };
  }

  try {
    const records = await Promise.race([
      fetchPubMedRecords([pmid]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PubMed lookup timed out")), 20_000)
      ),
    ]);
    const rec = records[0];
    const email = rec?.correspondingAuthorEmail?.trim().toLowerCase() || null;
    const name = rec?.correspondingAuthorName?.trim() || storedName;
    await persistCorrespondingAuthor(pmid, email, name);
    return {
      email,
      name,
      title: rec?.title ?? existing?.title ?? null,
      journal: rec?.journal ?? existing?.journal ?? null,
    };
  } catch (err) {
    console.warn(
      "[authorOutreach] PubMed lookup failed:",
      err instanceof Error ? err.message : err
    );
    return {
      email: null,
      name: storedName,
      title: existing?.title ?? null,
      journal: existing?.journal ?? null,
    };
  }
}

function builtCopy(params: {
  pmid: string;
  headline: string;
  title: string | null;
  journal: string | null;
  bodyText?: string | null;
  email?: string | null;
}): { subject: string; bodyText: string; html: string; text: string } {
  const base = publicAppBaseUrl();
  let optOutUrl: string | undefined;
  if (params.email) {
    try {
      optOutUrl = authorOutreachOptOutPageUrl(base, params.email);
    } catch {
      optOutUrl = undefined;
    }
  }
  const built = buildAuthorOutreachEmail({
    headline: params.headline,
    title: params.title,
    journal: params.journal,
    articleUrl: articleUrlForPmid(params.pmid),
    optOutUrl,
    logoUrl: `${base}/stewardship-brief-logo.png`,
    bodyText: params.bodyText ?? undefined,
  });
  return {
    subject: built.subject,
    bodyText: built.bodyText,
    html: built.html,
    text: built.text,
  };
}

export async function getAuthorOutreachByPmid(
  pmid: string
): Promise<AuthorOutreachRow | null> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("author_outreach")
      .select("*")
      .eq("pmid", pmid)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error.message)) return null;
      throw new Error(error.message);
    }
    return (data as AuthorOutreachRow | null) ?? null;
  } catch (err) {
    console.warn(
      "[authorOutreach] load failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * After a human rating: queue a draft when priority first crosses 5+,
 * or cancel a pending draft if the rating drops below 5.
 */
export async function syncAuthorOutreachAfterRating(input: {
  pmid: string;
  priority: number | null;
}): Promise<void> {
  const pmid = input.pmid.trim();
  if (!pmid) return;

  try {
    if (input.priority == null || input.priority < 5) {
      const existing = await getAuthorOutreachByPmid(pmid);
      if (existing?.status === "pending") {
        await updateAuthorOutreachStatus(pmid, "cancelled");
      }
      return;
    }

    const existing = await getAuthorOutreachByPmid(pmid);
    if (existing && TERMINAL_NO_REQUEUE.includes(existing.status)) {
      return;
    }
    if (existing?.status === "pending") {
      return;
    }

    const [corr, headline] = await Promise.all([
      resolveCorrespondingAuthor(pmid),
      loadHeadline(pmid),
    ]);
    const displayHeadline =
      headline?.trim() || corr.title?.trim() || `PMID ${pmid}`;
    const status: AuthorOutreachStatus = corr.email
      ? "pending"
      : "skipped_no_email";
    const copy = corr.email
      ? builtCopy({
          pmid,
          headline: displayHeadline,
          title: corr.title,
          journal: corr.journal,
          email: corr.email,
        })
      : {
          subject: AUTHOR_OUTREACH_SUBJECT,
          bodyText: null as string | null,
          html: null as string | null,
        };

    const supabase = getSupabaseServerClient();
    const row = {
      pmid,
      corresponding_email: corr.email,
      corresponding_name: corr.name,
      title: corr.title,
      journal: corr.journal ? formatJournalTitle(corr.journal) : corr.journal,
      headline: displayHeadline,
      status,
      subject: copy.subject,
      body_text: copy.bodyText,
      body_html: copy.html,
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
    };
    const { error } = await supabase
      .from("author_outreach")
      .upsert(row, { onConflict: "pmid" });
    if (error) {
      if (isMissingTable(error.message)) {
        console.warn(
          "[authorOutreach] table missing — run scripts/add_author_outreach.sql"
        );
        return;
      }
      throw new Error(error.message);
    }
  } catch (err) {
    // Rating save must not fail if outreach queue is unavailable.
    console.warn(
      "[authorOutreach] sync failed:",
      err instanceof Error ? err.message : err
    );
  }
}

export async function listAuthorOutreachForPreview(): Promise<{
  pending: AuthorOutreachRow[];
  noEmail: AuthorOutreachRow[];
  held: AuthorOutreachRow[];
  never: AuthorOutreachRow[];
  sent: AuthorOutreachRow[];
}> {
  const empty = {
    pending: [] as AuthorOutreachRow[],
    noEmail: [] as AuthorOutreachRow[],
    held: [] as AuthorOutreachRow[],
    never: [] as AuthorOutreachRow[],
    sent: [] as AuthorOutreachRow[],
  };
  try {
    const supabase = getSupabaseServerClient();
    const sentCutoffIso = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const [openRes, sentRes] = await Promise.all([
      supabase
        .from("author_outreach")
        .select("*")
        .in("status", ["pending", "skipped_no_email", "held", "never"])
        .order("queued_at", { ascending: false })
        .limit(100),
      supabase
        .from("author_outreach")
        .select("*")
        .eq("status", "sent")
        .gte("sent_at", sentCutoffIso)
        .order("sent_at", { ascending: false })
        .limit(50),
    ]);
    if (openRes.error) {
      if (isMissingTable(openRes.error.message)) return empty;
      throw new Error(openRes.error.message);
    }
    if (sentRes.error && !isMissingTable(sentRes.error.message)) {
      throw new Error(sentRes.error.message);
    }
    const openRows = (openRes.data ?? []) as AuthorOutreachRow[];
    const sentRows = (sentRes.data ?? []) as AuthorOutreachRow[];
    return {
      pending: openRows.filter((r) => r.status === "pending"),
      noEmail: openRows.filter((r) => r.status === "skipped_no_email"),
      held: openRows.filter((r) => r.status === "held"),
      never: openRows.filter((r) => r.status === "never"),
      sent: sentRows,
    };
  } catch (err) {
    console.warn(
      "[authorOutreach] list failed:",
      err instanceof Error ? err.message : err
    );
    return empty;
  }
}

export async function updateAuthorOutreachStatus(
  pmid: string,
  status: AuthorOutreachStatus
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("author_outreach")
    .update({ status, updated_at: new Date().toISOString(), error: null })
    .eq("pmid", pmid);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveAuthorOutreachEdits(input: {
  pmid: string;
  subject: string;
  bodyText: string;
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await getAuthorOutreachByPmid(input.pmid);
  if (!existing) return { ok: false, error: "Draft not found." };
  if (existing.status !== "pending" && existing.status !== "held") {
    return { ok: false, error: "Only pending or held drafts can be edited." };
  }
  const copy = builtCopy({
    pmid: existing.pmid,
    headline: existing.headline || existing.title || `PMID ${existing.pmid}`,
    title: existing.title,
    journal: existing.journal,
    bodyText: input.bodyText,
    email: existing.corresponding_email,
  });
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("author_outreach")
    .update({
      subject: input.subject.trim() || AUTHOR_OUTREACH_SUBJECT,
      body_text: copy.bodyText,
      body_html: copy.html,
      updated_at: new Date().toISOString(),
    })
    .eq("pmid", input.pmid);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isAuthorOutreachOptedOut(
  email: string
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("author_outreach_optouts")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error.message)) return false;
      console.warn("[authorOutreach] optout lookup failed:", error.message);
      return false;
    }
    return Boolean(data?.email);
  } catch {
    return false;
  }
}

export async function addAuthorOutreachOptOut(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { ok: false, error: "Invalid email" };
  }
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("author_outreach_optouts")
    .upsert({ email: normalized }, { onConflict: "email" });
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("author_outreach")
    .update({
      status: "skipped_optout",
      updated_at: new Date().toISOString(),
    })
    .eq("corresponding_email", normalized)
    .eq("status", "pending");

  return { ok: true };
}

export type AuthorOutreachSendResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: string[];
};

export async function sendPendingAuthorOutreach(
  cap = AUTHOR_OUTREACH_NIGHTLY_CAP
): Promise<AuthorOutreachSendResult> {
  const result: AuthorOutreachSendResult = {
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: [],
  };
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("author_outreach")
    .select("*")
    .eq("status", "pending")
    .not("corresponding_email", "is", null)
    .order("queued_at", { ascending: true })
    .limit(cap);

  if (error) {
    if (isMissingTable(error.message)) {
      return result;
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AuthorOutreachRow[];
  const from = getBriefDigestFromAddress();
  const base = publicAppBaseUrl();
  let listIdHost = "stewardshipbrief.com";
  try {
    listIdHost = new URL(base).hostname.replace(/^www\./, "");
  } catch {
    /* keep default */
  }

  for (const row of rows) {
    result.attempted += 1;
    const email = row.corresponding_email?.trim().toLowerCase() || "";
    if (!email.includes("@")) {
      await updateAuthorOutreachStatus(row.pmid, "skipped_no_email");
      result.skipped += 1;
      continue;
    }
    if (await isAuthorOutreachOptedOut(email)) {
      await updateAuthorOutreachStatus(row.pmid, "skipped_optout");
      result.skipped += 1;
      continue;
    }

    const copy = builtCopy({
      pmid: row.pmid,
      headline: row.headline || row.title || `PMID ${row.pmid}`,
      title: row.title,
      journal: row.journal,
      bodyText: row.body_text,
      email,
    });
    const subject = row.subject?.trim() || copy.subject;

    let unsubscribeApi: string | undefined;
    let unsubscribePage: string | undefined;
    try {
      unsubscribeApi = authorOutreachOptOutApiUrl(base, email);
      unsubscribePage = authorOutreachOptOutPageUrl(base, email);
    } catch {
      /* tokens optional if secret missing */
    }

    const headers: Record<string, string> = {
      "List-Id": `The Stewardship Brief author notes <authors.${listIdHost}>`,
      Precedence: "bulk",
    };
    if (unsubscribeApi) {
      headers["List-Unsubscribe"] = `<${unsubscribeApi}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    } else if (unsubscribePage) {
      headers["List-Unsubscribe"] = `<${unsubscribePage}>`;
    }

    try {
      const sent = await sendDigestEmail({
        to: [email],
        subject,
        html: copy.html,
        text: copy.text,
        from,
        headers,
      });
      const { error: markErr } = await supabase
        .from("author_outreach")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          resend_id: sent.id ?? null,
          body_html: copy.html,
          error: null,
        })
        .eq("pmid", row.pmid)
        .eq("status", "pending");
      if (markErr) {
        result.failed.push(`${email}: sent but mark failed: ${markErr.message}`);
      }
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push(`${email}: ${message}`);
      await supabase
        .from("author_outreach")
        .update({
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("pmid", row.pmid);
    }
  }

  return result;
}
