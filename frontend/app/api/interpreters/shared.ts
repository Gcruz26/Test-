import { NextResponse } from "next/server";
import type {
  InterpreterFilters,
  InterpreterItem,
  InterpreterListResponse,
  InterpreterPayload,
  InterpreterStatusCounts,
} from "../../../src/types/interpreter";
import { createSupabaseAdminClient } from "../../../src/lib/supabase/admin";

export const paymentFrequencyOptions = ["Weekly", "Biweekly", "Monthly"] as const;
export const statusOptions = ["Active", "Inactive", "On Hold", "Fully Onboarded", "Terminated", "Deactivated", "Resigned"] as const;
export const activeStatuses = ["Active", "Fully Onboarded"] as const;
export const terminatedStatuses = ["Inactive", "Terminated", "Deactivated", "Resigned"] as const;
export const defaultInterpreterPageSize = 25;
export const maxInterpreterPageSize = 100;

type InterpreterRow = {
  id: number;
  employee_id: string | null;
  full_name: string;
  email: string | null;
  language: string;
  location: string;
  country: string;
  client_id: number | null;
  payment_frequency: InterpreterItem["payment_frequency"];
  weekly: string | null;
  rate: number | string;
  status: InterpreterItem["status"];
  propio_interpreter_id: string | null;
  big_interpreter_id: string | null;
  equiti_voyce_id: string | null;
  equiti_martti_id: string | null;
  mercury_recipient_id: string | null;
  zoho_contact_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_error_message: string | null;
  created_at: string;
};

type ClientRow = {
  id: number;
  name: string;
};

type NormalizedInterpreterPayload =
  | { error: string }
  | {
      value: {
        employee_id: string;
        full_name: string;
        email: string;
        language: string;
        location: string;
        country: string;
        client_id: number;
        payment_frequency: InterpreterItem["payment_frequency"];
        weekly: string;
        rate: string;
        status: InterpreterItem["status"];
        propio_interpreter_id: string;
        big_interpreter_id: string;
        equiti_voyce_id: string;
        equiti_martti_id: string;
        mercury_recipient_id: string;
      };
    };

export function validationError(detail: string, status = 400) {
  return NextResponse.json({ detail }, { status });
}

export function normalizeInterpreterPayload(payload: InterpreterPayload): NormalizedInterpreterPayload {
  const employeeId = payload.employee_id.trim();
  const fullName = payload.full_name.trim();
  const email = payload.email.trim();
  const language = payload.language.trim();
  const location = payload.location.trim();
  const country = payload.country.trim();
  const propioInterpreterId = payload.propio_interpreter_id.trim();
  const bigInterpreterId = payload.big_interpreter_id.trim();
  const equitiVoyceId = payload.equiti_voyce_id.trim();
  const equitiMarttiId = payload.equiti_martti_id.trim();
  const mercuryRecipientId = payload.mercury_recipient_id.trim();
  const rateValue = Number(payload.rate);

  if (!employeeId || !fullName || !email || !language || !location || !country) {
    return { error: "All interpreter profile fields are required." };
  }

  if (!payload.client_id || payload.client_id <= 0) {
    return { error: "Associated client is invalid." };
  }

  if (!paymentFrequencyOptions.includes(payload.payment_frequency)) {
    return { error: "Payment frequency is invalid." };
  }

  if (!statusOptions.includes(payload.status)) {
    return { error: "Interpreter status is invalid." };
  }

  if (!Number.isFinite(rateValue) || rateValue < 0) {
    return { error: "Rate must be a valid non-negative number." };
  }

  return {
    value: {
      employee_id: employeeId,
      full_name: fullName,
      email,
      language,
      location,
      country,
      client_id: payload.client_id,
      payment_frequency: payload.payment_frequency,
      weekly: payload.weekly.trim(),
      rate: rateValue.toFixed(2),
      status: payload.status,
      propio_interpreter_id: propioInterpreterId,
      big_interpreter_id: bigInterpreterId,
      equiti_voyce_id: equitiVoyceId,
      equiti_martti_id: equitiMarttiId,
      mercury_recipient_id: mercuryRecipientId,
    },
  };
}

export async function fetchClientName(clientId: number) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("clients").select("id, name").eq("id", clientId).maybeSingle<ClientRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export function mapInterpreterItem(interpreter: InterpreterRow, clientName: string): InterpreterItem {
  return {
    id: interpreter.id,
    employee_id: interpreter.employee_id ?? "",
    full_name: interpreter.full_name,
    email: interpreter.email ?? "",
    language: interpreter.language,
    location: interpreter.location,
    country: interpreter.country,
    associated_client_id: interpreter.client_id ?? 0,
    associated_client_name: clientName,
    payment_frequency: interpreter.payment_frequency,
    weekly: interpreter.weekly ?? "",
    rate: String(interpreter.rate),
    status: interpreter.status,
    propio_interpreter_id: interpreter.propio_interpreter_id ?? "",
    big_interpreter_id: interpreter.big_interpreter_id ?? "",
    equiti_voyce_id: interpreter.equiti_voyce_id ?? "",
    equiti_martti_id: interpreter.equiti_martti_id ?? "",
    mercury_recipient_id: interpreter.mercury_recipient_id ?? "",
    zoho_contact_id: interpreter.zoho_contact_id,
    last_synced_at: interpreter.last_synced_at,
    sync_status: interpreter.sync_status,
    sync_error_message: interpreter.sync_error_message,
    created_at: interpreter.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyInterpreterFilters(query: any, filters: Partial<InterpreterFilters>) {
  if (filters.full_name?.trim()) {
    query = query.ilike("full_name", `%${filters.full_name.trim()}%`);
  }
  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/[\*,()]/g, " ");
    query = query.or(`full_name.ilike.*${escaped}*,employee_id.ilike.*${escaped}*,email.ilike.*${escaped}*,mercury_recipient_id.ilike.*${escaped}*`);
  }
  if (filters.employee_id?.trim()) {
    query = query.ilike("employee_id", `%${filters.employee_id.trim()}%`);
  }
  if (filters.language?.trim()) {
    query = query.ilike("language", `%${filters.language.trim()}%`);
  }
  if (filters.location?.trim()) {
    query = query.ilike("location", `%${filters.location.trim()}%`);
  }
  if (filters.country?.trim()) {
    query = query.ilike("country", `%${filters.country.trim()}%`);
  }
  if (filters.client_id?.trim()) {
    query = query.eq("client_id", Number(filters.client_id));
  }
  if (filters.payment_frequency?.trim()) {
    query = query.eq("payment_frequency", filters.payment_frequency);
  }
  if (filters.status?.trim()) {
    query = query.eq("status", filters.status);
  }
  return query;
}

type StatusCountRow = { status: string; zoho_contact_id: string | null; sync_status: string };

async function computeStatusCounts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  filters: Partial<InterpreterFilters>,
): Promise<InterpreterStatusCounts> {
  let query = admin.from("interpreters").select("status, zoho_contact_id, sync_status");
  query = applyInterpreterFilters(query, filters);

  const { data, error } = await query.returns<StatusCountRow[]>();
  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const activeSet = new Set<string>(activeStatuses);
  const terminatedSet = new Set<string>(terminatedStatuses);

  return {
    active: rows.filter((r) => activeSet.has(r.status)).length,
    on_hold: rows.filter((r) => r.status === "On Hold").length,
    terminated: rows.filter((r) => terminatedSet.has(r.status)).length,
    not_synced: rows.filter((r) => !r.zoho_contact_id || r.sync_status !== "synced").length,
  };
}

export async function listInterpreterItems(
  filters: Partial<InterpreterFilters>,
  pagination?: { page?: number; pageSize?: number },
): Promise<InterpreterListResponse> {
  const admin = createSupabaseAdminClient();
  const page = Math.max(1, Number(pagination?.page ?? 1) || 1);
  const pageSize = Math.min(maxInterpreterPageSize, Math.max(1, Number(pagination?.pageSize ?? defaultInterpreterPageSize) || defaultInterpreterPageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = admin
    .from("interpreters")
    .select(
      "id, employee_id, full_name, email, language, location, country, client_id, payment_frequency, weekly, rate, status, propio_interpreter_id, big_interpreter_id, equiti_voyce_id, equiti_martti_id, mercury_recipient_id, zoho_contact_id, last_synced_at, sync_status, sync_error_message, created_at",
      { count: "exact" },
    )
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

  query = applyInterpreterFilters(query, filters);

  const [{ data, error, count }, statusCounts] = await Promise.all([
    query.returns<InterpreterRow[]>(),
    computeStatusCounts(admin, filters),
  ]);
  if (error) {
    throw new Error(error.message);
  }

  const clientIds = [...new Set((data ?? []).map((item) => item.client_id).filter((value): value is number => Boolean(value)))];
  const clientMap = new Map<number, string>();

  if (clientIds.length > 0) {
    const { data: clients, error: clientError } = await admin
      .from("clients")
      .select("id, name")
      .in("id", clientIds)
      .returns<ClientRow[]>();

    if (clientError) {
      throw new Error(clientError.message);
    }

    (clients ?? []).forEach((client) => {
      clientMap.set(client.id, client.name);
    });
  }

  const items = (data ?? []).map((item) => mapInterpreterItem(item, clientMap.get(item.client_id ?? 0) ?? "Unknown"));
  const total = count ?? 0;

  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: total === 0 ? 1 : Math.ceil(total / pageSize),
    status_counts: statusCounts,
  };
}
