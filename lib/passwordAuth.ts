import "server-only";
import bcrypt from "bcryptjs";
import { getAuthUsersClient } from "@/lib/supabaseServer";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export type PasswordAuthUser = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) {
    return "That password is too long.";
  }
  return null;
}

export async function findUserByEmail(
  email: string
): Promise<PasswordAuthUser | null> {
  const supabase = getAuthUsersClient();
  const { data, error } = await supabase
    .from("auth_users")
    .select("id, email, name, password_hash")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error || !data) return null;
  const row = data as PasswordAuthUser;
  if (!row.id || !row.email) return null;
  return row;
}

export async function verifyPasswordLogin(
  email: string,
  password: string
): Promise<{ id: string; email: string; name?: string | null } | null> {
  const user = await findUserByEmail(email);
  if (!user?.password_hash) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export async function registerPasswordUser(
  emailRaw: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.password_hash) {
      return {
        ok: false,
        error: "An account already exists for that email. Sign in instead.",
      };
    }
    return {
      ok: false,
      error: "That email already uses Google. Choose Continue with Google.",
    };
  }

  const password_hash = await bcrypt.hash(password, 12);
  const supabase = getAuthUsersClient();
  const { error } = await supabase.from("auth_users").insert({
    email,
    name: email.split("@")[0],
    password_hash,
  });

  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (m.includes("duplicate") || m.includes("unique")) {
      return {
        ok: false,
        error: "An account already exists for that email. Sign in instead.",
      };
    }
    if (m.includes("schema cache") || m.includes("auth_users") || m.includes("does not exist")) {
      return {
        ok: false,
        error:
          "Password sign-in is not ready. Run scripts/add_next_auth.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
