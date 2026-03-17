type MercuryRecipient = {
  id: string;
  email: string;
  name?: string;
  status?: string;
  raw?: unknown;
};

type MercuryRecipientResponse = {
  recipients?: unknown[];
  data?: unknown[];
  items?: unknown[];
  next_cursor?: string | null;
  nextCursor?: string | null;
  pagination?: {
    next_cursor?: string | null;
    nextCursor?: string | null;
    has_more?: boolean;
    hasMore?: boolean;
  } | null;
};

const defaultMercuryBaseUrl = "https://api.mercury.com/api/v1";
const mercuryPageSize = 100;
const mercuryMaxRetries = 3;

function getMercuryConfig() {
  const apiToken = process.env.MERCURY_API_TOKEN?.trim();
  const baseUrl = process.env.MERCURY_API_BASE_URL?.trim() || defaultMercuryBaseUrl;

  if (!apiToken) {
    throw new Error("Missing MERCURY_API_TOKEN. Generate a Mercury API token in Mercury Settings > API Tokens and add it to the frontend environment.");
  }

  return {
    apiToken,
    baseUrl: baseUrl.replace(/\/$/, ""),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getResponseItems(payload: MercuryRecipientResponse): unknown[] {
  if (Array.isArray(payload.recipients)) {
    return payload.recipients;
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function getNextCursor(payload: MercuryRecipientResponse) {
  return (
    payload.next_cursor?.trim() ||
    payload.nextCursor?.trim() ||
    payload.pagination?.next_cursor?.trim() ||
    payload.pagination?.nextCursor?.trim() ||
    null
  );
}

function getRecipientString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeRecipient(raw: unknown): MercuryRecipient | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const id = getRecipientString(item.id ?? item.recipientId ?? item.recipient_id);
  const directEmail = getRecipientString(item.email);
  const nestedEmail =
    getRecipientString((item.contact as Record<string, unknown> | undefined)?.email) ||
    getRecipientString((item.bankAccount as Record<string, unknown> | undefined)?.email);
  const listEmail = Array.isArray(item.emails)
    ? item.emails.map(getRecipientString).find((value): value is string => Boolean(value))
    : null;
  const email = directEmail || nestedEmail || listEmail;

  if (!id || !email) {
    return null;
  }

  return {
    id,
    email: normalizeEmail(email),
    name:
      getRecipientString(item.name) ||
      getRecipientString((item.contact as Record<string, unknown> | undefined)?.name) ||
      undefined,
    status: getRecipientString(item.status) || undefined,
    raw,
  };
}

async function mercuryRequest(path: string, params: URLSearchParams) {
  const { apiToken, baseUrl } = getMercuryConfig();
  const url = `${baseUrl}${path}?${params.toString()}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= mercuryMaxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const isRetryable = response.status >= 500 || response.status === 429;
        const error = new Error(detail || `Mercury API request failed with status ${response.status}.`);

        if (!isRetryable || attempt === mercuryMaxRetries) {
          throw error;
        }

        lastError = error;
      } else {
        return (await response.json()) as MercuryRecipientResponse;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Mercury API request failed.");
      if (attempt === mercuryMaxRetries) {
        throw lastError;
      }
    }

    await sleep(250 * attempt);
  }

  throw lastError ?? new Error("Mercury API request failed.");
}

export async function listRecipients(): Promise<MercuryRecipient[]> {
  const recipients: MercuryRecipient[] = [];
  const seenPageTokens = new Set<string>();
  let startAfter: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      limit: String(mercuryPageSize),
    });

    if (startAfter) {
      params.set("start_after", startAfter);
    }

    const payload = await mercuryRequest("/recipients", params);
    const items = getResponseItems(payload);

    recipients.push(...items.map(normalizeRecipient).filter((item): item is MercuryRecipient => Boolean(item)));

    const nextCursor = getNextCursor(payload);
    if (!nextCursor || seenPageTokens.has(nextCursor)) {
      break;
    }

    seenPageTokens.add(nextCursor);
    startAfter = nextCursor;
  }

  return recipients;
}

export type { MercuryRecipient };
