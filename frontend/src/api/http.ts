async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  return parseJsonResponse<T>(response);
}

export async function readApiError(response: Response): Promise<string> {
  const data = await parseJsonResponse<{ detail?: string } | null>(response).catch(() => null);
  return typeof data?.detail === "string" ? data.detail : "Request failed";
}
