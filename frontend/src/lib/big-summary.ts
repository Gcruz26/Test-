import * as XLSX from "xlsx";
import type { BigPerMinuteRow, BigSummaryWorkbook } from "@/types/big-summary";

const REQUIRED_HEADERS = [
  "Job",
  "Site",
  "Interpreter Id",
  "Language",
  "Date",
  "Start At",
  "End At",
  "Duration (In hh:mm:ss)",
  "Job Type",
  "Skill Type",
  "Status",
  "Hold Time (In mm:ss)",
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildHeaderIndex(headerRow: unknown[]): Record<(typeof REQUIRED_HEADERS)[number], number> | null {
  const normalizedHeaders = headerRow.map((value) => normalizeHeader(value));
  const indexByHeader = {} as Record<(typeof REQUIRED_HEADERS)[number], number>;

  for (const header of REQUIRED_HEADERS) {
    const index = normalizedHeaders.findIndex((value) => value === normalizeHeader(header));
    if (index === -1) {
      return null;
    }
    indexByHeader[header] = index;
  }

  return indexByHeader;
}

function parseDurationToSeconds(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return 0;
  }

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  return 0;
}

export async function parseBigPerMinuteWorkbook(file: File): Promise<BigSummaryWorkbook> {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: "string", raw: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("CSV does not contain any readable rows.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIndex = buildHeaderIndex(rows[0] ?? []);
  if (!headerIndex) {
    throw new Error("Unexpected BIG per-minute format. Expected job-level columns like Job, Interpreter Id, Date, Duration, Status, and Hold Time.");
  }

  const parsedRows: BigPerMinuteRow[] = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
    .map((row) => ({
      job_id: String(row[headerIndex.Job] ?? "").trim(),
      site: String(row[headerIndex.Site] ?? "").trim(),
      interpreter_id: String(row[headerIndex["Interpreter Id"]] ?? "").trim(),
      language: String(row[headerIndex.Language] ?? "").trim(),
      service_date: String(row[headerIndex.Date] ?? "").trim(),
      start_at: String(row[headerIndex["Start At"]] ?? "").trim(),
      end_at: String(row[headerIndex["End At"]] ?? "").trim(),
      duration_text: String(row[headerIndex["Duration (In hh:mm:ss)"]] ?? "").trim(),
      duration_seconds: parseDurationToSeconds(row[headerIndex["Duration (In hh:mm:ss)"]]),
      job_type: String(row[headerIndex["Job Type"]] ?? "").trim(),
      skill_type: String(row[headerIndex["Skill Type"]] ?? "").trim(),
      status: String(row[headerIndex.Status] ?? "").trim(),
      hold_time_text: String(row[headerIndex["Hold Time (In mm:ss)"]] ?? "").trim(),
      hold_time_seconds: parseDurationToSeconds(row[headerIndex["Hold Time (In mm:ss)"]]),
    }))
    .filter((row) => row.job_id !== "");

  const interpreterIds = new Set(parsedRows.map((row) => row.interpreter_id).filter(Boolean));
  const languageCounts = parsedRows.reduce<Record<string, number>>((acc, row) => {
    if (row.language) {
      acc[row.language] = (acc[row.language] || 0) + 1;
    }
    return acc;
  }, {});

  const topLanguage =
    Object.entries(languageCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || "Unknown";

  const totals = parsedRows.reduce(
    (acc, row) => {
      acc.total_duration_seconds += row.duration_seconds;
      acc.total_hold_time_seconds += row.hold_time_seconds;

      if (row.status === "Completed") {
        acc.completed_count += 1;
      } else if (row.status === "Pending") {
        acc.pending_count += 1;
      } else if (row.status.toLowerCase().includes("cancelled")) {
        acc.cancelled_count += 1;
      }

      return acc;
    },
    {
      completed_count: 0,
      cancelled_count: 0,
      pending_count: 0,
      total_duration_seconds: 0,
      total_hold_time_seconds: 0,
    },
  );

  return {
    report_kind: "per_minute",
    row_count: parsedRows.length,
    completed_count: totals.completed_count,
    cancelled_count: totals.cancelled_count,
    pending_count: totals.pending_count,
    total_duration_seconds: totals.total_duration_seconds,
    total_hold_time_seconds: totals.total_hold_time_seconds,
    distinct_interpreters: interpreterIds.size,
    top_language: topLanguage,
    rows: parsedRows,
  };
}
