import { NextResponse } from "next/server";
import { clearDevAuthCookie, isDevAuthBypassEnabled } from "../../../../src/lib/auth/dev";
import { createSupabaseServerClient } from "../../../../src/lib/supabase/server";

export async function POST() {
  if (isDevAuthBypassEnabled()) {
    const response = NextResponse.json({ message: "Logged out successfully." });
    clearDevAuthCookie(response);
    return response;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: "Logged out successfully." });
}
