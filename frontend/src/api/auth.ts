import { clearToken } from "./token";
import { readApiError, readApiResponse } from "./http";
import { User } from "../types/auth";

async function requestAppAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return readApiResponse<T>(response);
}

export async function login(email: string, password: string): Promise<User> {
  const response = await requestAppAuth<{
    user: User;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return response.user;
}

export async function logout(): Promise<void> {
  try {
    await requestAppAuth<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    clearToken();
  }
}

export async function fetchCurrentUser(): Promise<User> {
  return requestAppAuth<User>("/auth/me", { method: "GET" });
}
