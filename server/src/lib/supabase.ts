import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Admin client: uses the service role key. Bypasses RLS. Never expose to the
 * client or log in full.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "autotube-server" } },
  },
);

/**
 * Build a Supabase client scoped to an end-user's JWT. Used when we want RLS
 * to apply (e.g. verifying that a user may read a particular video).
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
