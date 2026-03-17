import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../src/lib/auth/server";
import { createSupabaseAdminClient } from "../../../../src/lib/supabase/admin";
import type { InterpreterPayload } from "../../../../src/types/interpreter";
import {
  fetchClientName,
  mapInterpreterItem,
  normalizeInterpreterPayload,
  validationError,
} from "../shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAppUser(request, ["Admin", "Operations", "Finance", "Viewer"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  const { id } = await context.params;
  const interpreterId = Number(id);
  if (!Number.isInteger(interpreterId) || interpreterId <= 0) {
    return validationError("Interpreter id is invalid.");
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("interpreters")
      .select(
        "id, employee_id, full_name, email, language, location, country, client_id, payment_frequency, weekly, rate, status, propio_interpreter_id, big_interpreter_id, equiti_voyce_id, equiti_martti_id, mercury_recipient_id, zoho_contact_id, last_synced_at, sync_status, sync_error_message, created_at",
      )
      .eq("id", interpreterId)
      .maybeSingle();

    if (error) {
      return validationError(error.message, 500);
    }
    if (!data) {
      return validationError("Interpreter not found.", 404);
    }

    const clientName = data.client_id ? await fetchClientName(data.client_id) : null;
    return NextResponse.json(mapInterpreterItem(data, clientName?.name ?? "Unknown"));
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to load interpreter.", 500);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAppUser(request, ["Admin", "Operations"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  const { id } = await context.params;
  const interpreterId = Number(id);
  if (!Number.isInteger(interpreterId) || interpreterId <= 0) {
    return validationError("Interpreter id is invalid.");
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
    const { data: existing, error: existingError } = await admin
      .from("interpreters")
      .select("id, zoho_contact_id")
      .eq("id", interpreterId)
      .maybeSingle<{ id: number; zoho_contact_id: string | null }>();

    if (existingError) {
      return validationError(existingError.message, 500);
    }
    if (!existing) {
      return validationError("Interpreter not found.", 404);
    }
    if (existing.zoho_contact_id) {
      return validationError(
        "Zoho-synced interpreters are read-only in the platform. Update the Contact in Zoho CRM instead.",
        409,
      );
    }

    const { data, error } = await admin
      .from("interpreters")
      .update(normalized.value)
      .eq("id", interpreterId)
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

    return NextResponse.json(mapInterpreterItem(data, client.name));
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to update interpreter.", 500);
  }
}
