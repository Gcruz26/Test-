import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClientPlatform, ReportIntakeItem, ReportIntakeSummaryPayload, ReportKind } from "@/types/report-intake";

type ClientRow = {
  id: number;
  name: string;
};

type ReportIntakeRow = {
  id: number;
  client_id: number;
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
};

async function loadClientNameMap(clientIds: number[]) {
  const admin = createSupabaseAdminClient();
  const uniqueClientIds = [...new Set(clientIds)];

  if (uniqueClientIds.length === 0) {
    return new Map<number, string>();
  }

  const { data, error } = await admin.from("clients").select("id, name").in("id", uniqueClientIds).returns<ClientRow[]>();
  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((client) => [client.id, client.name]));
}

function mapReportIntakeItem(row: ReportIntakeRow, clientName: string): ReportIntakeItem {
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: clientName,
    client_platform: row.client_platform,
    date_range_start: row.date_range_start,
    date_range_end: row.date_range_end,
    file_name: row.file_name,
    file_format: row.file_format,
    report_kind: row.report_kind,
    period_label: row.period_label,
    row_count: row.row_count,
    status: row.status,
    summary_payload: row.summary_payload,
    created_at: row.created_at,
  };
}

export async function listReportIntakeItems(limit = 20): Promise<ReportIntakeItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("report_intakes")
    .select("id, client_id, client_platform, date_range_start, date_range_end, file_name, file_format, report_kind, period_label, row_count, status, summary_payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReportIntakeRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const clientMap = await loadClientNameMap(rows.map((row) => row.client_id));
  return rows.map((row) => mapReportIntakeItem(row, clientMap.get(row.client_id) ?? "Unknown"));
}

export async function getReportIntakeItem(id: number): Promise<ReportIntakeItem | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("report_intakes")
    .select("id, client_id, client_platform, date_range_start, date_range_end, file_name, file_format, report_kind, period_label, row_count, status, summary_payload, created_at")
    .eq("id", id)
    .maybeSingle<ReportIntakeRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const clientMap = await loadClientNameMap([data.client_id]);
  return mapReportIntakeItem(data, clientMap.get(data.client_id) ?? "Unknown");
}

export type { ReportIntakeRow };
