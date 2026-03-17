export type ReportKind = "propio_summary" | "big_per_minute" | "equiti_voyce";
export type ClientName = "Propio" | "BIG" | "Equiti";
export type ClientPlatform = "Propio Analytics" | "InterpVault" | "Voyce" | "Martti";
export type ReportIntakeExportFormat = "csv" | "xlsx";

export interface ReportIntakeInterpreterSummary {
  interpreter_name: string;
  client: ClientName;
  client_id: string;
  employee_id: string | null;
  language: string;
  total_calls: number;
  total_minutes: number;
  matched: boolean;
}

export interface ReportIntakeUnmatchedItem {
  client: ClientName;
  client_id: string;
  interpreter_name_from_report: string | null;
  reason: string;
}

export interface ReportIntakeSummaryPayload extends Record<string, unknown> {
  interpreter_summaries?: ReportIntakeInterpreterSummary[];
  unmatched_interpreters?: ReportIntakeUnmatchedItem[];
  matched_interpreters?: number;
  unmatched_interpreter_count?: number;
}

export interface ReportIntakeItem {
  id: number;
  client_id: number;
  client_name: string;
  client_platform: ClientPlatform;
  date_range_start: string;
  date_range_end: string;
  file_name: string;
  file_format: string;
  report_kind: ReportKind;
  period_label: string | null;
  row_count: number;
  status: string;
  summary_payload: ReportIntakeSummaryPayload;
  created_at: string;
}

export interface CreateReportIntakeResponse {
  message: string;
  intake: ReportIntakeItem;
}
