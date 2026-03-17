import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../src/lib/auth/server";
import { getReportIntakeItem } from "../../../../src/server/services/report-intakes/reportIntakeStore";

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ detail: "Invalid report intake ID." }, { status: 400 });
  }

  try {
    const item = await getReportIntakeItem(id);
    if (!item) {
      return NextResponse.json({ detail: "Report intake not found." }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to load report intake." },
      { status: 500 },
    );
  }
}
