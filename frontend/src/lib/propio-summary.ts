import * as XLSX from "xlsx";
import type { PropioSummaryRow, PropioSummaryWorkbook } from "@/types/propio-summary";

const REQUIRED_HEADERS = ["Agent", "Utilization %", "Total Portal Hours", "Calls", "Payable Minutes", "N/A's", "Rejects"] as const;
const HEADER_ALIASES: Record<(typeof REQUIRED_HEADERS)[number], string[]> = {
  Agent: ["Agent"],
  "Utilization %": ["Utilization %", "Utilization"],
  "Total Portal Hours": ["Total Portal Hours", "Portal Hours"],
  Calls: ["Calls"],
  "Payable Minutes": ["Payable Minutes", "Minutes", "Call Minutes"],
  "N/A's": ["N/A's", "N/A’s", "N/As", "NA's"],
  Rejects: ["Rejects", "Rejected"],
};

function isNonDataRow(agent: string): boolean {
  const normalized = agent.trim().toLowerCase();
  return normalized === "total" || normalized.startsWith("applied filters:");
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) return 0;
    const parsed = Number(trimmed.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function splitAgent(value: string) {
  const match = value.match(/^(.*?)(?:\s*-\s*([A-Za-z0-9][A-Za-z0-9._-]*))?$/);
  return {
    interpreter_name: match?.[1]?.trim() || value.trim(),
    client_interpreter_id: match?.[2]?.trim() || "",
  };
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildHeaderIndex(headerRow: unknown[]): Record<(typeof REQUIRED_HEADERS)[number], number> | null {
  const normalizedHeaders = headerRow.map((value) => normalizeHeader(value));
  const indexByRequiredHeader = {} as Record<(typeof REQUIRED_HEADERS)[number], number>;

  for (const requiredHeader of REQUIRED_HEADERS) {
    const aliases = HEADER_ALIASES[requiredHeader].map((alias) => normalizeHeader(alias));
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));

    if (index === -1) {
      return null;
    }

    indexByRequiredHeader[requiredHeader] = index;
  }

  return indexByRequiredHeader;
}

function findPropioSheet(workbook: XLSX.WorkBook) {
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headerIndex = buildHeaderIndex(rows[0] ?? []);

    if (headerIndex) {
      return { sheetName, rows, headerIndex };
    }
  }

  return null;
}

export async function parsePropioSummaryWorkbook(file: File): Promise<PropioSummaryWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const match = findPropioSheet(workbook);
  if (!match) {
    throw new Error("Could not find a valid Propio summary sheet. Expected headers like Agent, Utilization %, Total Portal Hours, Calls, and Payable Minutes.");
  }

  const { sheetName, rows, headerIndex } = match;

  const parsedRows: PropioSummaryRow[] = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
    .filter((row) => {
      const agent = String(row[headerIndex.Agent] ?? "").trim();
      return agent !== "" && !isNonDataRow(agent);
    })
    .map((row) => {
      const agent = String(row[headerIndex.Agent] ?? "").trim();
      const { interpreter_name, client_interpreter_id } = splitAgent(agent);
      const utilizationRaw = parseNumber(row[headerIndex["Utilization %"]]);
      const utilization_pct = utilizationRaw <= 1 ? utilizationRaw * 100 : utilizationRaw;

      return {
        agent,
        interpreter_name,
        client_interpreter_id,
        utilization_pct,
        total_portal_hours: parseNumber(row[headerIndex["Total Portal Hours"]]),
        calls: parseNumber(row[headerIndex.Calls]),
        payable_minutes: parseNumber(row[headerIndex["Payable Minutes"]]),
        na_count: parseNumber(row[headerIndex["N/A's"]]),
        rejects: parseNumber(row[headerIndex.Rejects]),
      };
    });

  const totals = parsedRows.reduce(
    (acc, row) => {
      acc.total_portal_hours += row.total_portal_hours;
      acc.total_calls += row.calls;
      acc.total_payable_minutes += row.payable_minutes;
      acc.total_na_count += row.na_count;
      acc.total_rejects += row.rejects;
      acc.utilization_sum += row.utilization_pct;
      return acc;
    },
    {
      total_portal_hours: 0,
      total_calls: 0,
      total_payable_minutes: 0,
      total_na_count: 0,
      total_rejects: 0,
      utilization_sum: 0,
    },
  );

  return {
    sheet_name: sheetName,
    row_count: parsedRows.length,
    average_utilization_pct: parsedRows.length ? totals.utilization_sum / parsedRows.length : 0,
    total_portal_hours: totals.total_portal_hours,
    total_calls: totals.total_calls,
    total_payable_minutes: totals.total_payable_minutes,
    total_na_count: totals.total_na_count,
    total_rejects: totals.total_rejects,
    rows: parsedRows,
  };
}
