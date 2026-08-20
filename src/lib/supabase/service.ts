import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 * Server-only, and only for background jobs with no user session (the
 * publish-due cron route). Never use this for anything a logged-in
 * user's own request drives — those should keep using the normal
 * cookie-based client in src/lib/supabase/server.ts so RLS still applies.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (from Supabase dashboard → Settings
 * → API → service_role secret) as a server-only env var — never prefix
 * it NEXT_PUBLIC_, and never return its value to a client component.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY isn't set. Add it in Vercel → Settings → Environment Variables (from Supabase dashboard → Settings → API) to enable the auto-publish cron job."
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
