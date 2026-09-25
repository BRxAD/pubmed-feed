import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  canonicalEmailInbox,
  easternCalendarDate,
  normalizeEmailAddress,
} from "@/lib/digest/emailAddress";

export type BriefRecipientSendKind = "brief";

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("brief_email_recipient_sends") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

/**
 * Claim one Brief email for this inbox for the Eastern calendar day.
 * Returns false if this inbox already received a Brief (digest or welcome) today.
 * If the dedicated table is missing, falls back to a sentinel row in
 * brief_email_sends so overlapping crons still cannot double-send.
 */
export async function claimBriefRecipientSend(email: string): Promise<boolean> {
  const sendTo = normalizeEmailAddress(email);
  const inboxKey = canonicalEmailInbox(sendTo);
  if (!sendTo || !inboxKey) return false;

  const sendDate = easternCalendarDate();

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("brief_email_recipient_sends").insert({
      inbox_key: inboxKey,
      kind: "brief" satisfies BriefRecipientSendKind,
      send_date: sendDate,
      sent_email: sendTo,
    });

    if (!error) return true;
    if (error.code === "23505") return false;
    if (isMissingTable(error.message)) {
      return claimViaSentinelPmid(inboxKey, sendDate);
    }
    console.warn("[briefRecipientSends] claim failed:", error.message);
    return true;
  } catch (err) {
    console.warn(
      "[briefRecipientSends] claim error:",
      err instanceof Error ? err.message : err
    );
    return true;
  }
}

/** Works before the dedicated table exists: reuse brief_email_sends PMID unique key. */
async function claimViaSentinelPmid(
  inboxKey: string,
  sendDate: string
): Promise<boolean> {
  const pmid = `rcpt:brief:${sendDate}:${inboxKey}`;
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("brief_email_sends").insert({ pmid });
    if (!error) return true;
    if (error.code === "23505") return false;
    console.warn("[briefRecipientSends] sentinel claim failed:", error.message);
    return true;
  } catch (err) {
    console.warn(
      "[briefRecipientSends] sentinel claim error:",
      err instanceof Error ? err.message : err
    );
    return true;
  }
}
