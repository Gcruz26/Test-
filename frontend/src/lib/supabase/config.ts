const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceRoleKey));
}

export function hasSupabaseBrowserEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function getSupabaseServerConfig() {
  if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey: supabaseAnonKey || supabaseServiceRoleKey!,
    serviceRoleKey: supabaseServiceRoleKey,
  };
}
