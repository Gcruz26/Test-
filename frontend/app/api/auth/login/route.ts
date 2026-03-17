import { NextResponse } from "next/server";
import { getDevAuthUser, isDevAuthBypassEnabled, isValidDevLogin, setDevAuthCookie } from "../../../../src/lib/auth/dev";
import { mapSupabaseUser } from "../../../../src/lib/auth/user";
import { createSupabaseServerClient } from "../../../../src/lib/supabase/server";

type LoginRequestBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
  const email = body?.email?.trim();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ detail: "Email and password are required." }, { status: 400 });
  }

  if (isDevAuthBypassEnabled()) {
    if (!isValidDevLogin(email, password)) {
      return NextResponse.json({ detail: "Invalid dev credentials." }, { status: 401 });
    }

    const response = NextResponse.json({ user: getDevAuthUser() });
    setDevAuthCookie(response);
    return response;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.json({ detail: error?.message ?? "Invalid credentials." }, { status: 401 });
  }

  return NextResponse.json({ user: mapSupabaseUser(data.user) });
}
