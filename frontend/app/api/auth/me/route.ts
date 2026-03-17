import { NextResponse } from "next/server";
import { getDevSessionUser, isDevAuthBypassEnabled } from "../../../../src/lib/auth/dev";
import { mapSupabaseUser } from "../../../../src/lib/auth/user";
import { createSupabaseServerClient } from "../../../../src/lib/supabase/server";

export async function GET() {
  if (isDevAuthBypassEnabled()) {
    const user = await getDevSessionUser();

    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(user);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(mapSupabaseUser(user));
}
