export interface BigPerMinuteRow {
  job_id: string;
  site: string;
  interpreter_id: string;
  language: string;
  service_date: string;
  start_at: string;
  end_at: string;
  duration_text: string;
  duration_seconds: number;
  job_type: string;
  skill_type: string;
  status: string;
  hold_time_text: string;
  hold_time_seconds: number;
}

export interface BigSummaryWorkbook {
  report_kind: "per_minute";
  row_count: number;
  completed_count: number;
  cancelled_count: number;
  pending_count: number;
  total_duration_seconds: number;
  total_hold_time_seconds: number;
  distinct_interpreters: number;
  top_language: string;
  rows: BigPerMinuteRow[];
}
