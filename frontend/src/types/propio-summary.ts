export interface PropioSummaryRow {
  agent: string;
  interpreter_name: string;
  client_interpreter_id: string;
  utilization_pct: number;
  total_portal_hours: number;
  calls: number;
  payable_minutes: number;
  na_count: number;
  rejects: number;
}

export interface PropioSummaryWorkbook {
  sheet_name: string;
  row_count: number;
  average_utilization_pct: number;
  total_portal_hours: number;
  total_calls: number;
  total_payable_minutes: number;
  total_na_count: number;
  total_rejects: number;
  rows: PropioSummaryRow[];
}
