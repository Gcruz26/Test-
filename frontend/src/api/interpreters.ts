import { getToken } from "./token";
import { readApiError, readApiResponse } from "./http";
import {
  InterpreterFilters,
  InterpreterItem,
  InterpreterListResponse,
  InterpreterMetaResponse,
  MercuryRecipientSyncResponse,
  InterpreterPayload,
  InterpreterSyncResponse,
  InterpreterSyncStatusResponse,
} from "../types/interpreter";

type ListInterpreterOptions = {
  page?: number;
  pageSize?: number;
};

function buildQuery(filters: InterpreterFilters, options: ListInterpreterOptions = {}): string {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim()) {
      params.set(key, value.trim());
    }
  });

  if (options.page && options.page > 0) {
    params.set("page", String(options.page));
  }

  if (options.pageSize && options.pageSize > 0) {
    params.set("page_size", String(options.pageSize));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return readApiResponse<T>(response);
}

export function listInterpreters(filters: InterpreterFilters, options: ListInterpreterOptions = {}): Promise<InterpreterListResponse> {
  return request<InterpreterListResponse>(`/interpreters${buildQuery(filters, options)}`);
}

export function getInterpreterMeta(): Promise<InterpreterMetaResponse> {
  return request<InterpreterMetaResponse>("/interpreters/meta");
}

export function getInterpreter(id: number): Promise<InterpreterItem> {
  return request<InterpreterItem>(`/interpreters/${id}`);
}

export function createInterpreter(payload: InterpreterPayload): Promise<InterpreterItem> {
  return request<InterpreterItem>("/interpreters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateInterpreter(id: number, payload: InterpreterPayload): Promise<InterpreterItem> {
  return request<InterpreterItem>(`/interpreters/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function syncInterpretersFromCRM(): Promise<InterpreterSyncResponse> {
  return request<InterpreterSyncResponse>("/interpreters/sync", {
    method: "POST",
  });
}

export function getInterpreterSyncStatus(): Promise<InterpreterSyncStatusResponse> {
  return request<InterpreterSyncStatusResponse>("/interpreters/sync-status");
}

export function syncMercuryRecipients(force = false): Promise<MercuryRecipientSyncResponse> {
  return request<MercuryRecipientSyncResponse>("/integrations/mercury/sync-recipient-ids", {
    method: "POST",
    body: JSON.stringify({ force }),
  });
}
