import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAuthUserUuid(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id.trim()));
}

/**
 * Resolve a real public.auth_users row for the signed-in person.
 * Heals JWTs that stored Google's `sub` (or another non-row id) instead of
 * our auth_users UUID — that mismatch caused saved_articles FK failures.
 */
export async function ensureAuthUserId(input: {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const email = (input.email ?? "").trim().toLowerCase();
  const claimedId = (input.id ?? "").trim();
  const supabase = getSupabaseServerClient();

  function syncSubscriberRow() {
    if (!email.includes("@")) return;
    void supabase
      .from("brief_subscribers")
      .upsert({ email }, { onConflict: "email" })
      .then(() => {}, () => {});
  }

  if (isAuthUserUuid(claimedId)) {
    const { data, error } = await supabase
      .from("auth_users")
      .select("id, email")
      .eq("id", claimedId)
      .maybeSingle();
    if (!error && data?.id) {
      // Keep the row, but prefer matching by email when the claimed UUID's
      // email disagrees (legacy duplicate-account cases).
      const rowEmail = String(
        (data as { email?: string | null }).email ?? ""
      )
        .trim()
        .toLowerCase();
      if (!email || !rowEmail || rowEmail === email) {
        syncSubscriberRow();
        return { id: String(data.id) };
      }
    }
  }

  if (!email.includes("@")) {
    return { error: "Please sign in again to save articles to your account." };
  }

  // Case-insensitive match (Google may store mixed-case emails).
  const { data: byEmailRows, error: emailError } = await supabase
    .from("auth_users")
    .select("id, email")
    .ilike("email", email)
    .limit(5);

  if (!emailError && byEmailRows && byEmailRows.length > 0) {
    const exact =
      byEmailRows.find(
        (row) => String(row.email ?? "").trim().toLowerCase() === email
      ) ?? byEmailRows[0];
    syncSubscriberRow();
    return { id: String(exact.id) };
  }

  const insert: Record<string, unknown> = {
    email,
    name: (input.name ?? "").trim() || email.split("@")[0],
    image: input.image ?? null,
    emailVerified: new Date().toISOString(),
  };
  // Reuse a claimed UUID only when it is valid and not already taken.
  if (isAuthUserUuid(claimedId)) {
    insert.id = claimedId;
  }

  const { data: created, error: createError } = await supabase
    .from("auth_users")
    .insert(insert)
    .select("id")
    .single();

  if (!createError && created?.id) {
    syncSubscriberRow();
    return { id: String(created.id) };
  }

  // Race: another request created the row.
  const { data: againRows } = await supabase
    .from("auth_users")
    .select("id")
    .ilike("email", email)
    .limit(1);
  if (againRows?.[0]?.id) {
    syncSubscriberRow();
    return { id: String(againRows[0].id) };
  }

  const msg = (createError?.message ?? "").toLowerCase();
  if (msg.includes("schema cache") || msg.includes("does not exist")) {
    return {
      error:
        "Account storage is not ready. Run scripts/add_next_auth.sql in Supabase.",
    };
  }

  return { error: "Please sign in again to save articles to your account." };
}
