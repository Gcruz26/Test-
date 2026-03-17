import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerConfig } from "./config";

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServerConfig();

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
