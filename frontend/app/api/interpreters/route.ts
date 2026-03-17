import { NextResponse } from "next/server";
import { requireAppUser } from "../../../src/lib/auth/server";
import { createSupabaseAdminClient } from "../../../src/lib/supabase/admin";
import type { InterpreterPayload } from "../../../src/types/interpreter";
import {
  fetchClientName,
  listInterpreterItems,
  mapInterpreterItem,
  normalizeInterpreterPayload,
  validationError,
} from "./shared";

export async function GET(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations", "Finance", "Viewer"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  const { searchParams } = new URL(request.url);

  try {
    const items = await listInterpreterItems({
      search: searchParams.get("search") ?? "",
      full_name: searchParams.get("full_name") ?? "",
      employee_id: searchParams.get("employee_id") ?? "",
      language: searchParams.get("language") ?? "",
      location: searchParams.get("location") ?? "",
      country: searchParams.get("country") ?? "",
      client_id: searchParams.get("client_id") ?? "",
      payment_frequency: searchParams.get("payment_frequency") ?? "",
      status: searchParams.get("status") ?? "",
    }, {
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("page_size") ?? "25"),
    });

    return NextResponse.json(items);
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to load interpreters.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  const payload = (await request.json().catch(() => null)) as InterpreterPayload | null;
  if (!payload) {
    return validationError("Invalid request payload.");
  }

  const normalized = normalizeInterpreterPayload(payload);
  if ("error" in normalized) {
    return validationError(normalized.error);
  }

  try {
    const client = await fetchClientName(normalized.value.client_id);
    if (!client) {
      return validationError("Associated client is invalid.");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("interpreters")
      .insert({
        ...normalized.value,
        sync_status: "manual",
      })
      .select(
        "id, employee_id, full_name, email, language, location, country, client_id, payment_frequency, weekly, rate, status, propio_interpreter_id, big_interpreter_id, equiti_voyce_id, equiti_martti_id, mercury_recipient_id, zoho_contact_id, last_synced_at, sync_status, sync_error_message, created_at",
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return validationError("Employee ID must be unique.", 409);
      }
      return validationError(error.message, 500);
    }

    return NextResponse.json(mapInterpreterItem(data, client.name), { status: 201 });
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to create interpreter.", 500);
  }
}
