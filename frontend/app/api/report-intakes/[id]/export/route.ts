import { NextResponse } from "next/server";
import { requireAppUser } from "../../../../../src/lib/auth/server";
import { buildReportSummaryExport, type ReportExportFormat } from "../../../../../src/server/services/report-intakes/reportIntakeExport";
import { getReportIntakeItem } from "../../../../../src/server/services/report-intakes/reportIntakeStore";

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFormat(value: string | null): ReportExportFormat | null {
  return value === "csv" || value === "xlsx" ? value : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAppUser(request, ["Admin", "Finance", "Operations"]);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ detail: "Invalid report intake ID." }, { status: 400 });
  }

  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  if (!format) {
    return NextResponse.json({ detail: "Export format must be csv or xlsx." }, { status: 400 });
  }

  try {
    const item = await getReportIntakeItem(id);
    if (!item) {
      return NextResponse.json({ detail: "Report intake not found." }, { status: 404 });
    }

    const summaries = item.summary_payload.interpreter_summaries ?? [];
    if (summaries.length === 0) {
      return NextResponse.json({ detail: "This report intake does not have a persisted summary to export." }, { status: 400 });
    }

    const file = buildReportSummaryExport(summaries, format);
    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to export report intake summary." },
      { status: 500 },
    );
  }
}
