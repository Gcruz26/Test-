import * as XLSX from "xlsx";
import type { ReportIntakeInterpreterSummary } from "@/types/report-intake";

type ReportExportFormat = "csv" | "xlsx";

function formatExportRows(rows: ReportIntakeInterpreterSummary[]) {
  return [...rows]
    .sort((left, right) => {
      const nameCompare = left.interpreter_name.localeCompare(right.interpreter_name, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) {
        return nameCompare;
      }

      const clientCompare = left.client.localeCompare(right.client, undefined, { sensitivity: "base" });
      if (clientCompare !== 0) {
        return clientCompare;
      }

      return left.client_id.localeCompare(right.client_id, undefined, { sensitivity: "base" });
    })
    .map((row) => ({
      "Interpreter Name": row.interpreter_name,
      Client: row.client,
      "Client ID": row.client_id,
      "Employee ID": row.employee_id ?? "",
      Language: row.language,
      "Total Calls": row.total_calls,
      "Total Minutes": row.total_minutes,
      Matched: row.matched ? "Yes" : "No",
    }));
}

function getFileDate() {
  return new Date().toISOString().slice(0, 10);
}

export function buildReportSummaryExport(rows: ReportIntakeInterpreterSummary[], format: ReportExportFormat) {
  const exportRows = formatExportRows(rows);
  const baseName = `interpreter_client_summary_${getFileDate()}`;

  if (format === "csv") {
    const headers = Object.keys(exportRows[0] ?? {
      "Interpreter Name": "",
      Client: "",
      "Client ID": "",
      "Employee ID": "",
      Language: "",
      "Total Calls": "",
      "Total Minutes": "",
      Matched: "",
    });
    const lines = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];

    return {
      buffer: Buffer.from(lines.join("\n"), "utf-8"),
      contentType: "text/csv; charset=utf-8",
      fileName: `${baseName}.csv`,
    };
  }

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return {
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: `${baseName}.xlsx`,
  };
}

export type { ReportExportFormat };
