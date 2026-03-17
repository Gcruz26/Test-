const tokenKey = "alfa_token";

export function setToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(tokenKey, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(tokenKey);
}

export function clearToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(tokenKey);
}
