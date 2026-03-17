import { createSupabaseAdminClient } from "../../../src/lib/supabase/admin";
import type { InterpreterItem, InterpreterStatus, PaymentFrequency } from "../../../src/types/interpreter";

const DEFAULT_FIELD_MAPPING = {
  employee_id: "Emplyee_ID",
  full_name: "Full_Name",
  email: "Email",
  language: "Language",
  location: "Service Location",
  country: "Mailing_Country",
  associated_client: "Client",
  propio_interpreter_id: "Propio_ID",
  cloudbreak_id: "CloudBreak_ID",
  big_interpreter_id: "BIG_ID",
  payment_frequency: "Payment_Type",
  weekly: "Weekly",
  rate: "Agreed_Rate",
  status: "Stage",
} as const;

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type ZohoSettingsRow = {
  id: number;
  base_url: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  module_name: string;
  field_mapping: Partial<Record<keyof typeof DEFAULT_FIELD_MAPPING, string>> | null;
};

type ClientRow = {
  id: number;
  name: string;
};

type SyncInterpreterRow = {
  id: number;
  employee_id: string | null;
  full_name: string;
  email: string | null;
  language: string;
  location: string;
  country: string;
  client_id: number | null;
  payment_frequency: PaymentFrequency;
  weekly: string | null;
  rate: number | string;
  status: InterpreterStatus;
  propio_interpreter_id: string | null;
  big_interpreter_id: string | null;
  mercury_recipient_id: string | null;
  zoho_contact_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_error_message: string | null;
  created_at: string;
};

type SyncSummary = {
  total_fetched: number;
  eligible: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
};

type NormalizedZohoContact =
  | {
      type: "skipped";
      reason: string;
      zoho_contact_id: string;
    }
  | {
      type: "eligible";
      zoho_contact_id: string;
      employee_id: string | null;
      full_name: string;
      email: string | null;
      language: string;
      location: string;
      country: string;
      associated_client: string | null;
      propio_interpreter_id: string | null;
      cloudbreak_id: string | null;
      big_interpreter_id: string | null;
      payment_frequency: PaymentFrequency | null;
      weekly: string;
      rate: string | null;
      status: InterpreterStatus;
    };

const CRM_STATUS_MAP: Record<string, InterpreterStatus> = {
  active: "Active",
  hired: "Fully Onboarded",
  "fully onboarded": "Fully Onboarded",
  "interpreter ready for production": "Fully Onboarded",
  inactive: "Deactived",
  deactivated: "Deactived",
  deactived: "Deactived",
  terminated: "Terminated",
  resigned: "Resigned",
  "inactive / not moving forward": "Deactived",
  "failed onboarding": "Deactived",
  "on hold": "On Hold",
  on_hold: "On Hold",
  onboarding: "On Hold",
  recruiting: "On Hold",
  "admin onboarding": "On Hold",
  training: "On Hold",
  "candidate language assessment": "On Hold",
  "candidate id/background verification": "On Hold",
  "candidate interview": "On Hold",
  "contract & payment setup (interpreter)": "On Hold",
  "interpreter system specs review": "On Hold",
  requested: "On Hold",
  "id verification": "On Hold",
  "training required (client/tier)": "On Hold",
};

function inferTokenUrl(baseUrl: string) {
  if (baseUrl.includes(".zohoapis.eu")) return "https://accounts.zoho.eu/oauth/v2/token";
  if (baseUrl.includes(".zohoapis.in")) return "https://accounts.zoho.in/oauth/v2/token";
  if (baseUrl.includes(".zohoapis.com.au")) return "https://accounts.zoho.com.au/oauth/v2/token";
  if (baseUrl.includes(".zohoapis.jp")) return "https://accounts.zoho.jp/oauth/v2/token";
  if (baseUrl.includes(".zohoapis.sa")) return "https://accounts.zoho.sa/oauth/v2/token";
  if (baseUrl.includes(".zohoapis.ca")) return "https://accounts.zohocloud.ca/oauth/v2/token";
  return "https://accounts.zoho.com/oauth/v2/token";
}

function getMergedFieldMapping(fieldMapping: ZohoSettingsRow["field_mapping"]) {
  return {
    ...DEFAULT_FIELD_MAPPING,
    ...(fieldMapping ?? {}),
  };
}

function buildZohoFieldsParam(fieldMapping: ReturnType<typeof getMergedFieldMapping>) {
  return [...new Set(["id", ...Object.values(fieldMapping).map((value) => String(value ?? "").trim()).filter(Boolean)])].join(",");
}

function getValueFromRecord(record: Record<string, unknown>, fieldName: string): unknown {
  const value = record[fieldName];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const candidate = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).id;
        if (candidate) return candidate;
      }

      if (item !== null && item !== undefined && String(item).trim()) {
        return item;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    return (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).id ?? null;
  }

  return value;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown sync error";
}

function parsePaymentFrequency(value: unknown): PaymentFrequency | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("biweekly") || normalized.includes("bi-weekly")) return "Biweekly";
  if (normalized.includes("monthly")) return "Monthly";
  if (normalized.includes("weekly")) return "Weekly";

  return null;
}

function parseRate(value: unknown): string | null {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed.toFixed(2);
}

function normalizeStatus(value: unknown): InterpreterStatus | null {
  const status = String(value ?? "").trim().toLowerCase();
  return CRM_STATUS_MAP[status] ?? null;
}

function normalizeZohoContact(
  record: Record<string, unknown>,
  fieldMapping: ReturnType<typeof getMergedFieldMapping>,
): NormalizedZohoContact {
  const zohoContactId = String(record.id ?? "").trim();
  if (!zohoContactId) {
    return { type: "skipped", reason: "Missing Zoho contact id", zoho_contact_id: "" };
  }

  const status = normalizeStatus(getValueFromRecord(record, fieldMapping.status));
  if (!status) {
    return { type: "skipped", reason: "Unsupported status", zoho_contact_id: zohoContactId };
  }

  const fullName = normalizeText(getValueFromRecord(record, fieldMapping.full_name));
  const employeeId = normalizeText(getValueFromRecord(record, fieldMapping.employee_id));
  const email = normalizeText(getValueFromRecord(record, fieldMapping.email));

  if (!fullName || (!employeeId && !email)) {
    return { type: "skipped", reason: "Missing minimum required identity fields", zoho_contact_id: zohoContactId };
  }

  return {
    type: "eligible",
    zoho_contact_id: zohoContactId,
    employee_id: employeeId,
    full_name: fullName,
    email,
    language: normalizeText(getValueFromRecord(record, fieldMapping.language)) ?? "",
    location: normalizeText(getValueFromRecord(record, fieldMapping.location)) ?? "",
    country: normalizeText(getValueFromRecord(record, fieldMapping.country)) ?? "",
    associated_client: normalizeText(getValueFromRecord(record, fieldMapping.associated_client)),
    propio_interpreter_id: normalizeText(getValueFromRecord(record, fieldMapping.propio_interpreter_id)),
    cloudbreak_id: normalizeText(getValueFromRecord(record, fieldMapping.cloudbreak_id)),
    big_interpreter_id: normalizeText(getValueFromRecord(record, fieldMapping.big_interpreter_id)),
    payment_frequency: parsePaymentFrequency(getValueFromRecord(record, fieldMapping.payment_frequency)),
    weekly: normalizeText(getValueFromRecord(record, fieldMapping.weekly)) ?? "",
    rate: parseRate(getValueFromRecord(record, fieldMapping.rate)),
    status,
  };
}

async function logSyncEvent(
  admin: SupabaseAdmin,
  level: "INFO" | "WARNING" | "ERROR",
  eventType: string,
  message: string,
  detail?: Record<string, unknown>,
) {
  await admin.from("integration_logs").insert({
    integration_name: "zoho_crm",
    level,
    event_type: eventType,
    message,
    detail: detail ?? null,
  });
}

async function getZohoSettings(admin: SupabaseAdmin) {
  const { data, error } = await admin
    .from("zoho_crm_settings")
    .select("id, base_url, client_id, client_secret, refresh_token, module_name, field_mapping")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<ZohoSettingsRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Zoho CRM settings are not configured.");
  }

  const missing = ["base_url", "client_id", "client_secret", "refresh_token", "module_name"].filter((key) => !String(data[key as keyof ZohoSettingsRow] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`Zoho CRM settings are incomplete: ${missing.join(", ")}`);
  }

  return data;
}

async function refreshZohoAccessToken(settings: ZohoSettingsRow) {
  const response = await fetch(inferTokenUrl(settings.base_url), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: settings.refresh_token,
      client_id: settings.client_id,
      client_secret: settings.client_secret,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Failed to refresh Zoho CRM access token.");
  }

  return payload.access_token;
}

async function fetchZohoContacts(
  settings: ZohoSettingsRow,
  accessToken: string,
  fieldMapping: ReturnType<typeof getMergedFieldMapping>,
) {
  const records: Record<string, unknown>[] = [];
  let page = 1;
  let pageToken: string | null = null;
  const fields = buildZohoFieldsParam(fieldMapping);

  while (true) {
    const query = new URLSearchParams({
      fields,
      per_page: "200",
    });

    if (pageToken) {
      query.set("page_token", pageToken);
    } else {
      query.set("page", String(page));
    }

    const response = await fetch(`${settings.base_url.replace(/\/$/, "")}/${settings.module_name}?${query.toString()}`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: Record<string, unknown>[];
      info?: { more_records?: boolean; next_page_token?: string };
      message?: string;
    };

    if (!response.ok) {
      throw new Error(payload.message || "Failed to fetch Zoho CRM contacts.");
    }

    records.push(...(payload.data ?? []));
    pageToken = typeof payload.info?.next_page_token === "string" && payload.info.next_page_token.trim() ? payload.info.next_page_token : null;
    if (!payload.info?.more_records) {
      break;
    }

    if (!pageToken) {
      page += 1;
    }
  }

  return records;
}

async function getOrCreateClientId(admin: SupabaseAdmin, clientName: string | null, cache: Map<string, number>) {
  const normalizedName = String(clientName ?? "").trim();
  if (!normalizedName) {
    return null;
  }

  const cacheKey = normalizedName.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const { data: existing, error: existingError } = await admin
    .from("clients")
    .select("id, name")
    .ilike("name", normalizedName)
    .maybeSingle<ClientRow>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    cache.set(cacheKey, existing.id);
    return existing.id;
  }

  const { data: created, error: createdError } = await admin
    .from("clients")
    .insert({
      name: normalizedName,
      code: normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null,
    })
    .select("id, name")
    .single<ClientRow>();

  if (createdError || !created) {
    throw new Error(createdError?.message ?? "Failed to create associated client.");
  }

  cache.set(cacheKey, created.id);
  return created.id;
}

async function findInterpreterForSync(
  admin: SupabaseAdmin,
  normalized: Extract<NormalizedZohoContact, { type: "eligible" }>,
) {
  const matches = new Map<number, SyncInterpreterRow>();
  const selectColumns =
    "id, employee_id, full_name, email, language, location, country, client_id, payment_frequency, weekly, rate, status, propio_interpreter_id, big_interpreter_id, mercury_recipient_id, zoho_contact_id, last_synced_at, sync_status, sync_error_message, created_at";

  if (normalized.zoho_contact_id) {
    const { data, error } = await admin
      .from("interpreters")
      .select(selectColumns)
      .eq("zoho_contact_id", normalized.zoho_contact_id)
      .returns<SyncInterpreterRow[]>();

    if (error) throw new Error(error.message);
    (data ?? []).forEach((item) => matches.set(item.id, item));
  }

  if (normalized.employee_id) {
    const { data, error } = await admin
      .from("interpreters")
      .select(selectColumns)
      .eq("employee_id", normalized.employee_id)
      .returns<SyncInterpreterRow[]>();

    if (error) throw new Error(error.message);
    (data ?? []).forEach((item) => matches.set(item.id, item));
  }

  if (normalized.email) {
    const { data, error } = await admin
      .from("interpreters")
      .select(selectColumns)
      .eq("email", normalized.email)
      .returns<SyncInterpreterRow[]>();

    if (error) throw new Error(error.message);
    (data ?? []).forEach((item) => matches.set(item.id, item));
  }

  if (normalized.propio_interpreter_id) {
    const { data, error } = await admin
      .from("interpreters")
      .select(selectColumns)
      .eq("propio_interpreter_id", normalized.propio_interpreter_id)
      .returns<SyncInterpreterRow[]>();

    if (error) throw new Error(error.message);
    (data ?? []).forEach((item) => matches.set(item.id, item));
  }

  const bigId = normalized.big_interpreter_id ?? normalized.cloudbreak_id;
  if (bigId) {
    const { data, error } = await admin
      .from("interpreters")
      .select(selectColumns)
      .eq("big_interpreter_id", bigId)
      .returns<SyncInterpreterRow[]>();

    if (error) throw new Error(error.message);
    (data ?? []).forEach((item) => matches.set(item.id, item));
  }

  if (matches.size > 1) {
    throw new Error("Multiple interpreter records matched the same CRM contact.");
  }

  return [...matches.values()][0] ?? null;
}

async function updateZohoSyncStatus(
  admin: SupabaseAdmin,
  settingsId: number,
  status: "success" | "partial_failure" | "error",
  message: string | null,
) {
  await admin
    .from("zoho_crm_settings")
    .update({
      last_full_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error_message: message,
    })
    .eq("id", settingsId);
}

export async function runInterpreterCRMSync(): Promise<SyncSummary> {
  const admin = createSupabaseAdminClient();
  const settings = await getZohoSettings(admin);
  const fieldMapping = getMergedFieldMapping(settings.field_mapping);
  const accessToken = await refreshZohoAccessToken(settings);
  const contacts = await fetchZohoContacts(settings, accessToken, fieldMapping);
  const summary: SyncSummary = {
    total_fetched: contacts.length,
    eligible: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    message: "Interpreter CRM sync completed.",
  };

  const clientCache = new Map<string, number>();

  for (const contact of contacts) {
    const normalized = normalizeZohoContact(contact, fieldMapping);

    if (normalized.type === "skipped") {
      summary.skipped += 1;
      continue;
    }

    summary.eligible += 1;

    try {
      const existing = await findInterpreterForSync(admin, normalized);
      const clientId = await getOrCreateClientId(admin, normalized.associated_client, clientCache);
      const bigInterpreterId = normalized.big_interpreter_id ?? normalized.cloudbreak_id ?? existing?.big_interpreter_id ?? null;
      const recordPayload = {
        employee_id: normalized.employee_id ?? existing?.employee_id ?? null,
        full_name: normalized.full_name,
        email: normalized.email ?? existing?.email ?? null,
        language: normalized.language || existing?.language || "",
        location: normalized.location || existing?.location || "",
        country: normalized.country || existing?.country || "",
        client_id: clientId ?? existing?.client_id ?? null,
        payment_frequency: normalized.payment_frequency ?? existing?.payment_frequency ?? "Weekly",
        weekly: normalized.weekly || existing?.weekly || "",
        rate: normalized.rate ?? String(existing?.rate ?? "0.00"),
        status: normalized.status,
        propio_interpreter_id: normalized.propio_interpreter_id ?? existing?.propio_interpreter_id ?? null,
        big_interpreter_id: bigInterpreterId,
        zoho_contact_id: normalized.zoho_contact_id,
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
        sync_error_message: null,
      };

      if (!recordPayload.employee_id && !recordPayload.email) {
        summary.skipped += 1;
        continue;
      }

      if (existing) {
        const { error } = await admin.from("interpreters").update(recordPayload).eq("id", existing.id);
        if (error) throw new Error(error.message);
        summary.updated += 1;
      } else {
        const { error } = await admin.from("interpreters").insert(recordPayload);
        if (error) throw new Error(error.message);
        summary.created += 1;
      }
    } catch (error) {
      summary.errors += 1;
      await logSyncEvent(admin, "ERROR", "interpreter_crm_sync_error", "Interpreter CRM sync record failed", {
        zoho_contact_id: normalized.zoho_contact_id,
        error: getErrorMessage(error),
      });
    }
  }

  const syncStatus = summary.errors > 0 ? "partial_failure" : "success";
  const errorMessage = summary.errors > 0 ? `${summary.errors} interpreter record(s) failed during CRM sync.` : null;
  await updateZohoSyncStatus(admin, settings.id, syncStatus, errorMessage);
  await logSyncEvent(admin, summary.errors > 0 ? "WARNING" : "INFO", "interpreter_crm_sync", "Interpreter CRM sync completed", summary);

  summary.message = summary.errors > 0 ? "Interpreter CRM sync completed with some errors." : "Interpreter CRM sync completed.";
  return summary;
}
