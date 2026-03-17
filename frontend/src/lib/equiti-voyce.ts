import * as XLSX from "xlsx";
import type { EquitiVoyceRow, EquitiVoyceWorkbook } from "@/types/equiti-voyce";

function normalizeHeader(value: unknown, index: number) {
  const trimmed = String(value ?? "").trim().replace(/\uFEFF/g, "");
  return trimmed || `Column ${index + 1}`;
}

function toCellString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export async function parseEquitiVoyceCsv(file: File): Promise<EquitiVoyceWorkbook> {
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

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((value, index) => normalizeHeader(value, index)).filter(Boolean);

  if (headers.length === 0) {
    throw new Error("Equiti Voyce CSV is missing a header row.");
  }

  const parsedRows: EquitiVoyceRow[] = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
    .map((row) =>
      headers.reduce<EquitiVoyceRow>((acc, header, index) => {
        acc[header] = toCellString(row[index]);
        return acc;
      }, {}),
    );

  return {
    source_platform: "Voyce",
    row_count: parsedRows.length,
    column_count: headers.length,
    headers,
    rows: parsedRows,
  };
}
