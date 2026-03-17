import type { User } from "../../types/auth";
import { getDevSessionUser, isDevAuthBypassEnabled } from "./dev";
import { mapSupabaseUser } from "./user";
import { createSupabaseServerClient } from "../supabase/server";

type AuthFailure = {
  error: string;
  status: number;
};

type AuthSuccess = {
  user: User;
};

export async function requireAppUser(
  _request: Request,
  allowedRoles?: User["role"][],
): Promise<AuthFailure | AuthSuccess> {
  if (isDevAuthBypassEnabled()) {
    const currentUser = await getDevSessionUser();

    if (!currentUser) {
      return { error: "Unauthorized", status: 401 };
    }

    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      return { error: "Forbidden", status: 403 };
    }

    return { user: currentUser };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUser = user ? mapSupabaseUser(user) : null;

  if (!currentUser) {
    return { error: "Unauthorized", status: 401 };
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return { error: "Forbidden", status: 403 };
  }

  return { user: currentUser };
}
