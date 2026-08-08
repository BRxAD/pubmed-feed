import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server Supabase client (service role).
 *
 * Prefer the project API URL (`https://<ref>.supabase.co`), not a direct
 * Postgres URL on port 5432. supabase-js talks to PostgREST; Supabase pools
 * those connections. Direct DB URLs from serverless can exhaust connection
 * limits — use the pooler (port 6543 / Session mode) only for raw SQL clients.
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
