import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseAdminEnv } from "./env";

export function createSupabaseAdminClient() {
  const { secretKey, url } = getSupabaseAdminEnv();

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
