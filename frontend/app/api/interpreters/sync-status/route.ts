import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../src/lib/auth/server";
import { createSupabaseAdminClient } from "../../../../src/lib/supabase/admin";
import { validationError } from "../shared";

type SyncSettingsRow = {
  last_full_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error_message: string | null;
};

export async function GET(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations", "Finance", "Viewer"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: settings, error: settingsError } = await admin
      .from("zoho_crm_settings")
      .select("last_full_sync_at, last_sync_status, last_sync_error_message")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle<SyncSettingsRow>();

    if (settingsError) {
      return validationError(settingsError.message, 500);
    }

    const [{ count: syncedRecords, error: syncedError }, { count: errorRecords, error: errorCountError }] = await Promise.all([
      admin.from("interpreters").select("*", { count: "exact", head: true }).eq("sync_status", "synced"),
      admin.from("interpreters").select("*", { count: "exact", head: true }).eq("sync_status", "error"),
    ]);

    if (syncedError) {
      return validationError(syncedError.message, 500);
    }

    if (errorCountError) {
      return validationError(errorCountError.message, 500);
    }

    return NextResponse.json({
      last_full_sync_at: settings?.last_full_sync_at ?? null,
      last_sync_status: settings?.last_sync_status ?? "not_available",
      last_sync_error_message: settings?.last_sync_error_message ?? null,
      synced_records: syncedRecords ?? 0,
      error_records: errorRecords ?? 0,
    });
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to load interpreter sync status.", 500);
  }
}
