import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../src/lib/auth/server";
import { validationError } from "../shared";
import { runInterpreterCRMSync } from "../sync-core";

export async function POST(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations"]);
  if ("error" in auth) {
    return validationError(auth.error, auth.status);
  }

  try {
    const summary = await runInterpreterCRMSync();
    return NextResponse.json(summary);
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Failed to sync interpreters from CRM.", 500);
  }
}
