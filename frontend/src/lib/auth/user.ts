import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { User, UserRole } from "../../types/auth";

const allowedRoles: UserRole[] = ["Admin", "Finance", "Operations", "Viewer"];

function resolveRole(candidate: unknown): UserRole {
  if (typeof candidate === "string" && allowedRoles.includes(candidate as UserRole)) {
    return candidate as UserRole;
  }

  return "Viewer";
}

export function mapSupabaseUser(user: SupabaseUser): User {
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};

  return {
    id: user.id,
    email: user.email ?? "",
    full_name:
      (typeof metadata.full_name === "string" && metadata.full_name) ||
      (typeof metadata.name === "string" && metadata.name) ||
      user.email ||
      "Unknown User",
    role: resolveRole(appMetadata.role ?? metadata.role),
  };
}
