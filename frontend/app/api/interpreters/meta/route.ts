import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../src/lib/auth/server";
import { createSupabaseAdminClient } from "../../../../src/lib/supabase/admin";
import { paymentFrequencyOptions, statusOptions, validationError } from "../shared";

export async function GET(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations", "Finance", "Viewer"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("clients").select("id, name").order("name", { ascending: true });

    if (error) {
      return validationError(error.message, 500);
    }

    return NextResponse.json({
      clients: data ?? [],
      payment_frequency_options: [...paymentFrequencyOptions],
      status_options: [...statusOptions],
    });
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to load interpreter metadata.", 500);
  }
}
