import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";

function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  );
}

function format<T>(obj: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      delete obj[key];
    }
    if (isDate(value)) {
      obj[key] = new Date(value);
    }
  }
  return obj as T;
}

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * NextAuth adapter using public.auth_* tables (no custom schema to expose).
 */
export function PublicAuthAdapter(): Adapter {
  const supabase = client();

  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const { data, error } = await supabase
        .from("auth_users")
        .insert({
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: user.emailVerified?.toISOString?.() ?? user.emailVerified,
        })
        .select()
        .single();
      if (error) throw error;
      return format<AdapterUser>(data as Record<string, unknown>);
    },
    async getUser(id) {
      const { data, error } = await supabase
        .from("auth_users")
        .select()
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return format<AdapterUser>(data as Record<string, unknown>);
    },
    async getUserByEmail(email) {
      const { data, error } = await supabase
        .from("auth_users")
        .select()
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return format<AdapterUser>(data as Record<string, unknown>);
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const { data: account, error } = await supabase
        .from("auth_accounts")
        .select("userId")
        .match({ provider, providerAccountId })
        .maybeSingle();
      if (error) throw error;
      const userId = (account as { userId?: string } | null)?.userId;
      if (!userId) return null;
      const { data: user, error: userError } = await supabase
        .from("auth_users")
        .select()
        .eq("id", userId)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return null;
      return format<AdapterUser>(user as Record<string, unknown>);
    },
    async updateUser(user) {
      const { data, error } = await supabase
        .from("auth_users")
        .update({
          ...user,
          emailVerified:
            user.emailVerified instanceof Date
              ? user.emailVerified.toISOString()
              : user.emailVerified,
        })
        .eq("id", user.id as string)
        .select()
        .single();
      if (error) throw error;
      return format<AdapterUser>(data as Record<string, unknown>);
    },
    async deleteUser(userId) {
      const { error } = await supabase.from("auth_users").delete().eq("id", userId);
      if (error) throw error;
    },
    async linkAccount(account: AdapterAccount) {
      const { error } = await supabase.from("auth_accounts").insert(account);
      if (error) throw error;
    },
    async unlinkAccount({
      providerAccountId,
      provider,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const { error } = await supabase
        .from("auth_accounts")
        .delete()
        .match({ provider, providerAccountId });
      if (error) throw error;
    },
    async createSession({ sessionToken, userId, expires }) {
      const { data, error } = await supabase
        .from("auth_sessions")
        .insert({
          sessionToken,
          userId,
          expires: expires.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return format<AdapterSession>(data as Record<string, unknown>);
    },
    async getSessionAndUser(sessionToken) {
      const { data: session, error } = await supabase
        .from("auth_sessions")
        .select()
        .eq("sessionToken", sessionToken)
        .maybeSingle();
      if (error) throw error;
      if (!session) return null;
      const userId = (session as { userId?: string }).userId;
      if (!userId) return null;
      const { data: user, error: userError } = await supabase
        .from("auth_users")
        .select()
        .eq("id", userId)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return null;
      return {
        user: format<AdapterUser>(user as Record<string, unknown>),
        session: format<AdapterSession>(session as Record<string, unknown>),
      };
    },
    async updateSession(session) {
      const { data, error } = await supabase
        .from("auth_sessions")
        .update({
          ...session,
          expires:
            session.expires instanceof Date
              ? session.expires.toISOString()
              : session.expires,
        })
        .eq("sessionToken", session.sessionToken as string)
        .select()
        .single();
      if (error) throw error;
      return format<AdapterSession>(data as Record<string, unknown>);
    },
    async deleteSession(sessionToken) {
      const { error } = await supabase
        .from("auth_sessions")
        .delete()
        .eq("sessionToken", sessionToken);
      if (error) throw error;
    },
    async createVerificationToken(token) {
      const { data, error } = await supabase
        .from("auth_verification_tokens")
        .insert({
          ...token,
          expires: token.expires.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as Record<string, unknown>;
      const { id: _id, ...verificationToken } = row;
      return format<VerificationToken>(verificationToken);
    },
    async useVerificationToken({ identifier, token }) {
      const { data, error } = await supabase
        .from("auth_verification_tokens")
        .delete()
        .match({ identifier, token })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      const { id: _id, ...verificationToken } = row;
      return format<VerificationToken>(verificationToken);
    },
  };
}
