import type { ClientPlatform, CreateReportIntakeResponse, ReportIntakeExportFormat, ReportIntakeItem, ReportKind } from "@/types/report-intake";
import { readApiError, readApiResponse } from "./http";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return readApiResponse<T>(response);
}

export function listReportIntakes(): Promise<ReportIntakeItem[]> {
  return request<ReportIntakeItem[]>("/report-intakes");
}

export function getReportIntake(id: number): Promise<ReportIntakeItem> {
  return request<ReportIntakeItem>(`/report-intakes/${id}`);
}

export function createReportIntake(payload: {
  clientName: string;
  clientPlatform: ClientPlatform;
  dateRangeStart: string;
  dateRangeEnd: string;
  reportKind: ReportKind;
  file: File;
}): Promise<CreateReportIntakeResponse> {
  const formData = new FormData();
  formData.append("clientName", payload.clientName);
  formData.append("clientPlatform", payload.clientPlatform);
  formData.append("dateRangeStart", payload.dateRangeStart);
  formData.append("dateRangeEnd", payload.dateRangeEnd);
  formData.append("reportKind", payload.reportKind);
  formData.append("file", payload.file);

  return request<CreateReportIntakeResponse>("/report-intakes", {
    method: "POST",
    body: formData,
  });
}

export async function exportReportIntakeSummary(id: number, format: ReportIntakeExportFormat) {
  const response = await fetch(`/api/report-intakes/${id}/export?format=${format}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/i);

  return {
    blob: await response.blob(),
    fileName: fileNameMatch?.[1] ?? `interpreter_client_summary.${format}`,
  };
}
