import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../../src/lib/auth/server";
import { syncMercuryRecipientIds } from "../../../../../src/server/services/integrations/mercuryRecipientSyncService";

export async function POST(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Operations", "Finance"]);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const payload = (await request.json().catch(() => null)) as { force?: boolean } | null;

  try {
    const summary = await syncMercuryRecipientIds(Boolean(payload?.force));
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Failed to sync Mercury recipient IDs.",
      },
      { status: 500 },
    );
  }
}
