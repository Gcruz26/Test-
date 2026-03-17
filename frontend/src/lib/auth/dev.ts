import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "../../types/auth";

export const DEV_AUTH_COOKIE = "alfa-dev-auth";

const DEV_AUTH_COOKIE_MAX_AGE = 60 * 60 * 8;

const DEV_USER: User = {
  id: "dev-admin",
  email: "admin@alfa.local",
  full_name: "Local Admin",
  role: "Admin",
};

const DEV_PASSWORD = "admin123";

export function isDevAuthBypassEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.DEV_AUTH_BYPASS === "true";
}

export function getDevAuthUser() {
  return DEV_USER;
}

export function isValidDevLogin(email: string, password: string) {
  return email.trim().toLowerCase() === DEV_USER.email.toLowerCase() && password === DEV_PASSWORD;
}

export async function getDevSessionUser() {
  if (!isDevAuthBypassEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(DEV_AUTH_COOKIE)?.value === "1" ? DEV_USER : null;
}

export function setDevAuthCookie(response: NextResponse) {
  response.cookies.set(DEV_AUTH_COOKIE, "1", {
    httpOnly: true,
    maxAge: DEV_AUTH_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
}

export function clearDevAuthCookie(response: NextResponse) {
  response.cookies.set(DEV_AUTH_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
    sameSite: "lax",
  });
}

export function hasDevAuthCookie(request: NextRequest) {
  return request.cookies.get(DEV_AUTH_COOKIE)?.value === "1";
}
