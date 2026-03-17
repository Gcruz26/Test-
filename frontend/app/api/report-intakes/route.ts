import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../src/lib/supabase/admin";
import { requireAppUser } from "../../../src/lib/auth/server";
import { parsePropioSummaryWorkbook } from "../../../src/lib/propio-summary";
import { parseBigPerMinuteWorkbook } from "../../../src/lib/big-summary";
import { parseEquitiVoyceCsv } from "../../../src/lib/equiti-voyce";
import {
  buildInterpreterMatchingContext,
  buildMatchedInterpreterSummary,
  normalizeRowsForReport,
  type InterpreterRow,
} from "../../../src/server/services/report-intakes/reportInterpreterMatching";
import { getReportIntakeItem, listReportIntakeItems } from "../../../src/server/services/report-intakes/reportIntakeStore";
import type { BigPerMinuteRow } from "../../../src/types/big-summary";
import type { EquitiVoyceRow } from "../../../src/types/equiti-voyce";
import type { PropioSummaryRow } from "../../../src/types/propio-summary";
import type { ClientName, ClientPlatform, ReportIntakeSummaryPayload, ReportKind } from "../../../src/types/report-intake";

type ClientRow = {
  id: number;
  name: string;
};

type ReportIntakeRow = Awaited<ReturnType<typeof getReportIntakeItem>>;

const interpreterPageSize = 1000;

function validationError(detail: string, status = 400) {
  return NextResponse.json({ detail }, { status });
}

function derivePeriodLabel(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || null;
}

const CLIENT_PLATFORM_OPTIONS: Record<ClientName, readonly ClientPlatform[]> = {
  Equiti: ["Voyce", "Martti"],
  Propio: ["Propio Analytics"],
  BIG: ["InterpVault"],
};
const CLIENT_REPORT_KIND: Partial<Record<`${ClientName}:${ClientPlatform}`, ReportKind>> = {
  "Propio:Propio Analytics": "propio_summary",
  "BIG:InterpVault": "big_per_minute",
  "Equiti:Voyce": "equiti_voyce",
};

function parseIsoDate(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return trimmed;
}

function validateClientPlatform(clientName: string, clientPlatform: string): clientPlatform is ClientPlatform {
  const platforms = CLIENT_PLATFORM_OPTIONS[clientName as ClientName];
  return Array.isArray(platforms) && platforms.includes(clientPlatform as ClientPlatform);
}

async function findOrCreateClientId(admin: ReturnType<typeof createSupabaseAdminClient>, clientName: string) {
  const { data: existing, error: existingError } = await admin
    .from("clients")
    .select("id, name")
    .eq("name", clientName)
    .maybeSingle<ClientRow>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing.id;
  }

  const code = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const { data: created, error: createdError } = await admin
    .from("clients")
    .insert({ name: clientName, code: code || null })
    .select("id, name")
    .single<ClientRow>();

  if (createdError) {
    throw new Error(createdError.message);
  }

  return created.id;
}

async function listInterpreterProfiles(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const interpreters: InterpreterRow[] = [];
  let from = 0;

  while (true) {
    const to = from + interpreterPageSize - 1;
    const { data, error } = await admin
      .from("interpreters")
      .select("id, employee_id, full_name, language, propio_interpreter_id, big_interpreter_id, equiti_voyce_id, equiti_martti_id")
      .order("id", { ascending: true })
      .range(from, to)
      .returns<InterpreterRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    const batch = data ?? [];
    interpreters.push(...batch);

    if (batch.length < interpreterPageSize) {
      break;
    }

    from += interpreterPageSize;
  }

  return interpreters;
}

async function insertRowsInChunks(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  reportIntakeId: number,
  rows: Array<Record<string, unknown> | PropioSummaryRow | BigPerMinuteRow | EquitiVoyceRow>,
) {
  const chunkSize = 500;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize).map((row, chunkIndex) => ({
      report_intake_id: reportIntakeId,
      row_number: index + chunkIndex + 1,
      row_payload: { ...row },
    }));

    const { error } = await admin.from("report_intake_rows").insert(chunk);
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function GET(request: Request) {
  const auth = await requireAppUser(request);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const items = await listReportIntakeItems();
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to load report intakes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAppUser(request, ["Admin", "Finance", "Operations"]);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const clientPlatform = String(formData.get("clientPlatform") ?? "").trim();
    const dateRangeStart = String(formData.get("dateRangeStart") ?? "").trim();
    const dateRangeEnd = String(formData.get("dateRangeEnd") ?? "").trim();
    const reportKind = String(formData.get("reportKind") ?? "").trim() as ReportKind;
    const file = formData.get("file");

    if (!clientName) {
      return validationError("Client name is required.");
    }

    if (!(clientName in CLIENT_PLATFORM_OPTIONS)) {
      return validationError("Unsupported client name.");
    }

    if (!clientPlatform) {
      return validationError("Client platform is required.");
    }

    if (!validateClientPlatform(clientName, clientPlatform)) {
      return validationError("Client platform is invalid for the selected client.");
    }

    const selectedPair = `${clientName}:${clientPlatform}` as `${ClientName}:${ClientPlatform}`;

    if (CLIENT_REPORT_KIND[selectedPair] !== reportKind) {
      return validationError("Unsupported report kind for the selected client.");
    }

    let normalizedStartDate: string;
    let normalizedEndDate: string;

    try {
      normalizedStartDate = parseIsoDate(dateRangeStart, "Start date");
      normalizedEndDate = parseIsoDate(dateRangeEnd, "End date");
    } catch (error) {
      return validationError(error instanceof Error ? error.message : "Invalid report date range.");
    }

    if (normalizedEndDate < normalizedStartDate) {
      return validationError("End date cannot be earlier than start date.");
    }

    if (!(file instanceof File)) {
      return validationError("Upload file is required.");
    }

    const admin = createSupabaseAdminClient();
    const clientId = await findOrCreateClientId(admin, clientName);

    let rowCount = 0;
    let summaryPayload: ReportIntakeSummaryPayload;
    let rows: PropioSummaryRow[] | BigPerMinuteRow[] | EquitiVoyceRow[];

    if (reportKind === "propio_summary") {
      const parsed = await parsePropioSummaryWorkbook(file);
      rowCount = parsed.row_count;
      summaryPayload = {
        sheet_name: parsed.sheet_name,
        average_utilization_pct: parsed.average_utilization_pct,
        total_portal_hours: parsed.total_portal_hours,
        total_calls: parsed.total_calls,
        total_payable_minutes: parsed.total_payable_minutes,
        total_na_count: parsed.total_na_count,
        total_rejects: parsed.total_rejects,
      };
      rows = parsed.rows.map((row) => ({ ...row }));
    } else if (reportKind === "big_per_minute") {
      const parsed = await parseBigPerMinuteWorkbook(file);
      rowCount = parsed.row_count;
      summaryPayload = {
        completed_count: parsed.completed_count,
        cancelled_count: parsed.cancelled_count,
        pending_count: parsed.pending_count,
        total_duration_seconds: parsed.total_duration_seconds,
        total_hold_time_seconds: parsed.total_hold_time_seconds,
        distinct_interpreters: parsed.distinct_interpreters,
        top_language: parsed.top_language,
      };
      rows = parsed.rows.map((row) => ({ ...row }));
    } else if (reportKind === "equiti_voyce") {
      const parsed = await parseEquitiVoyceCsv(file);
      rowCount = parsed.row_count;
      summaryPayload = {
        source_platform: parsed.source_platform,
        column_count: parsed.column_count,
        headers: parsed.headers,
      };
      rows = parsed.rows.map((row) => ({ ...row }));
    } else {
      return validationError("Unsupported report kind.");
    }

    const interpreters = await listInterpreterProfiles(admin);
    const matchingContext = buildInterpreterMatchingContext(interpreters);
    const normalizedRows = normalizeRowsForReport({
      clientName: clientName as ClientName,
      clientPlatform,
      reportKind,
      rows,
    });
    const interpreterSummary = buildMatchedInterpreterSummary({
      clientName: clientName as ClientName,
      clientPlatform,
      normalizedRows,
      matchingContext,
    });

    summaryPayload = {
      ...summaryPayload,
      matched_interpreters: interpreterSummary.summaries.filter((item) => item.matched).length,
      unmatched_interpreter_count: interpreterSummary.unmatched.length,
      interpreter_summaries: interpreterSummary.summaries,
      unmatched_interpreters: interpreterSummary.unmatched,
    };

    const { data: intake, error: intakeError } = await admin
      .from("report_intakes")
      .insert({
        client_id: clientId,
        client_platform: clientPlatform,
        date_range_start: normalizedStartDate,
        date_range_end: normalizedEndDate,
        uploaded_by_user_id: auth.user.id,
        file_name: file.name,
        file_format: file.name.split(".").pop()?.toLowerCase() || "unknown",
        report_kind: reportKind,
        period_label: derivePeriodLabel(file.name),
        row_count: rowCount,
        summary_payload: summaryPayload,
        status: "imported",
      })
      .select("id")
      .single<{ id: number }>();

    if (intakeError || !intake) {
      throw new Error(intakeError?.message ?? "Failed to create report intake.");
    }

    await insertRowsInChunks(admin, intake.id, rows);

    const item = await getReportIntakeItem(intake.id);
    if (!item) {
      throw new Error("Failed to reload saved report intake.");
    }
    return NextResponse.json({
      message: "Report stored successfully.",
      intake: item,
    });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to store report intake." },
      { status: 500 },
    );
  }
}
