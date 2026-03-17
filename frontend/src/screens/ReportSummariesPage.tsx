"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileJson, FileSpreadsheet, Table2 } from "lucide-react";
import { exportReportIntakeSummary, getReportIntake, listReportIntakes } from "@/api/report-intakes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientName, ClientPlatform, ReportIntakeExportFormat, ReportIntakeInterpreterSummary, ReportIntakeItem, ReportIntakeUnmatchedItem } from "@/types/report-intake";

type Props = {
  initialIntakeId?: number | null;
  requestedIntakeId?: number | null;
};

type MatchFilter = "all" | "matched" | "unmatched";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMinutes(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sortInterpreterSummaries(rows: ReportIntakeInterpreterSummary[]) {
  return [...rows].sort((left, right) => {
    const nameCompare = left.interpreter_name.localeCompare(right.interpreter_name, undefined, { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }

    const clientCompare = left.client.localeCompare(right.client, undefined, { sensitivity: "base" });
    if (clientCompare !== 0) {
      return clientCompare;
    }

    return left.client_id.localeCompare(right.client_id, undefined, { sensitivity: "base" });
  });
}

function summarizeHistoryItem(item: ReportIntakeItem) {
  const interpreterSummaries = item.summary_payload.interpreter_summaries ?? [];
  const unmatchedInterpreters = item.summary_payload.unmatched_interpreters ?? [];

  if (interpreterSummaries.length > 0 || unmatchedInterpreters.length > 0) {
    return `Matched ${formatNumber(interpreterSummaries.filter((row) => row.matched).length)} • Unmatched ${formatNumber(unmatchedInterpreters.length)}`;
  }

  return `${formatNumber(item.row_count)} rows`;
}

export function ReportSummariesPage({ initialIntakeId = null, requestedIntakeId = null }: Props) {
  const [reportIntakes, setReportIntakes] = useState<ReportIntakeItem[]>([]);
  const [currentIntake, setCurrentIntake] = useState<ReportIntakeItem | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [pageError, setPageError] = useState("");
  const [isLoadingIntake, setIsLoadingIntake] = useState(false);
  const [clientFilter, setClientFilter] = useState<"All" | ClientName>("All");
  const [platformFilter, setPlatformFilter] = useState<"All" | ClientPlatform>("All");
  const [dateRangeStartFilter, setDateRangeStartFilter] = useState("");
  const [dateRangeEndFilter, setDateRangeEndFilter] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");

  const targetIntakeId = requestedIntakeId ?? initialIntakeId ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const data = await listReportIntakes();
        setReportIntakes(data);
        setHistoryError("");
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : "Failed to load saved imports.");
      }
    })();
  }, []);

  useEffect(() => {
    if (reportIntakes.length === 0) {
      return;
    }

    const fallbackId = reportIntakes[0]?.id ?? null;
    const intakeIdToLoad = targetIntakeId ?? fallbackId;

    if (!intakeIdToLoad || currentIntake?.id === intakeIdToLoad) {
      return;
    }

    setIsLoadingIntake(true);
    setPageError("");

    void (async () => {
      try {
        const item = await getReportIntake(intakeIdToLoad);
        setCurrentIntake(item);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Failed to load report summary.");
      } finally {
        setIsLoadingIntake(false);
      }
    })();
  }, [currentIntake?.id, reportIntakes, targetIntakeId]);

  const filteredReportIntakes = useMemo(() => {
    return reportIntakes.filter((item) => {
      if (clientFilter !== "All" && item.client_name !== clientFilter) {
        return false;
      }

      if (platformFilter !== "All" && item.client_platform !== platformFilter) {
        return false;
      }

      if (dateRangeStartFilter && item.date_range_end < dateRangeStartFilter) {
        return false;
      }

      if (dateRangeEndFilter && item.date_range_start > dateRangeEndFilter) {
        return false;
      }

      return true;
    });
  }, [clientFilter, dateRangeEndFilter, dateRangeStartFilter, platformFilter, reportIntakes]);

  const currentInterpreterSummaries = useMemo(() => {
    const rows = sortInterpreterSummaries(currentIntake?.summary_payload.interpreter_summaries ?? []);
    return rows.filter((row) => {
      if (matchFilter === "matched" && !row.matched) {
        return false;
      }

      if (matchFilter === "unmatched" && row.matched) {
        return false;
      }

      return true;
    });
  }, [currentIntake, matchFilter]);

  const currentUnmatched = useMemo<ReportIntakeUnmatchedItem[]>(() => currentIntake?.summary_payload.unmatched_interpreters ?? [], [currentIntake]);

  async function handleOpenIntake(item: ReportIntakeItem) {
    setIsLoadingIntake(true);
    setPageError("");

    try {
      const fullItem = await getReportIntake(item.id);
      setCurrentIntake(fullItem);
      window.history.replaceState({}, "", `/report-summaries/${item.id}`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load report summary.");
    } finally {
      setIsLoadingIntake(false);
    }
  }

  async function handleExportSummary(format: ReportIntakeExportFormat) {
    if (!currentIntake) {
      return;
    }

    try {
      const result = await exportReportIntakeSummary(currentIntake.id, format);
      downloadBlob(result.blob, result.fileName);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to export summary.");
    }
  }

  function openActiveIntakeJson() {
    if (!currentIntake) {
      return;
    }

    window.open(`/api/report-intakes/${currentIntake.id}`, "_blank", "noopener,noreferrer");
  }

  function openActiveIntakeExport(format: ReportIntakeExportFormat) {
    if (!currentIntake) {
      return;
    }

    window.open(`/api/report-intakes/${currentIntake.id}/export?format=${format}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,_#101827,_#1a3150_52%,_#0b6a77)] px-6 py-5 text-slate-50 shadow-[0_18px_48px_rgba(15,23,42,0.16)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="eyebrow !text-cyan-200">Results workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Report Summaries</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/80">
              Review processed report results, matched and unmatched interpreters, and export summary data.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Current intake</span>
            <strong className="mt-1 block text-lg">{currentIntake ? `#${currentIntake.id}` : "No intake selected"}</strong>
            {currentIntake ? (
              <span className="mt-1 block text-sm text-slate-200/80">
                {currentIntake.client_name} • {currentIntake.client_platform}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Card className="border-slate-200/90 bg-white/90">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-slate-950">Saved imports</CardTitle>
              <CardDescription>Choose a stored intake to open its processed summary.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label htmlFor="report-summary-client-filter" className="text-sm font-medium text-slate-700">
                    Client filter
                  </label>
                  <select
                    id="report-summary-client-filter"
                    value={clientFilter}
                    onChange={(event) => setClientFilter(event.target.value as "All" | ClientName)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="All">All clients</option>
                    <option value="Propio">Propio</option>
                    <option value="BIG">BIG</option>
                    <option value="Equiti">Equiti</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="report-summary-platform-filter" className="text-sm font-medium text-slate-700">
                    Platform filter
                  </label>
                  <select
                    id="report-summary-platform-filter"
                    value={platformFilter}
                    onChange={(event) => setPlatformFilter(event.target.value as "All" | ClientPlatform)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="All">All platforms</option>
                    <option value="Propio Analytics">Propio Analytics</option>
                    <option value="InterpVault">InterpVault</option>
                    <option value="Voyce">Voyce</option>
                    <option value="Martti">Martti</option>
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label htmlFor="report-summary-start-filter" className="text-sm font-medium text-slate-700">
                      Start date
                    </label>
                    <input
                      id="report-summary-start-filter"
                      type="date"
                      value={dateRangeStartFilter}
                      onChange={(event) => setDateRangeStartFilter(event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="report-summary-end-filter" className="text-sm font-medium text-slate-700">
                      End date
                    </label>
                    <input
                      id="report-summary-end-filter"
                      type="date"
                      value={dateRangeEndFilter}
                      onChange={(event) => setDateRangeEndFilter(event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>

              {historyError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{historyError}</div> : null}
              {filteredReportIntakes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No saved imports matched the current filters.
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredReportIntakes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleOpenIntake(item)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        currentIntake?.id === item.id
                          ? "border-cyan-300 bg-cyan-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-slate-950">{item.file_name}</strong>
                          <span className="text-sm text-slate-500">
                            #{item.id} • {item.client_name} • {item.client_platform}
                          </span>
                        </div>
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {item.report_kind}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                        <span>{formatDate(item.date_range_start)} - {formatDate(item.date_range_end)}</span>
                        <span>{summarizeHistoryItem(item)}</span>
                        <span>{formatDateTime(item.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card className="border-slate-200/90 bg-white/90">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl text-slate-950">Processed summary</CardTitle>
                  <CardDescription>
                    {currentIntake
                      ? `Summary grouped by interpreter, client, and client-specific interpreter ID for ${currentIntake.file_name}.`
                      : "Select a saved intake to review its processed results."}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={openActiveIntakeJson} disabled={!currentIntake}>
                    <FileJson className="size-4" />
                    Open JSON
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleExportSummary("csv")} disabled={!currentIntake}>
                    <Download className="size-4" />
                    Export CSV
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleExportSummary("xlsx")} disabled={!currentIntake}>
                    <FileSpreadsheet className="size-4" />
                    Export Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {pageError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</div> : null}
              {isLoadingIntake ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Loading processed summary...</div>
              ) : null}
              {currentIntake ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <strong className="block text-slate-950">{formatNumber(currentInterpreterSummaries.length)}</strong>
                      Summary rows
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <strong className="block text-slate-950">{formatNumber(currentInterpreterSummaries.filter((row) => row.matched).length)}</strong>
                      Matched rows
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <strong className="block text-slate-950">{formatNumber(currentUnmatched.length)}</strong>
                      Unmatched rows
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <strong className="text-slate-950">Intake #{currentIntake.id}</strong>
                      <span>{currentIntake.client_name} • {currentIntake.client_platform}</span>
                      <span>{formatDate(currentIntake.date_range_start)} - {formatDate(currentIntake.date_range_end)}</span>
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="summary-match-filter" className="text-sm font-medium text-slate-700">
                        Row filter
                      </label>
                      <select
                        id="summary-match-filter"
                        value={matchFilter}
                        onChange={(event) => setMatchFilter(event.target.value as MatchFilter)}
                        className="h-11 min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="all">All rows</option>
                        <option value="matched">Matched only</option>
                        <option value="unmatched">Unmatched only</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block text-slate-950">Saved intake endpoints</strong>
                        <div className="mt-1 truncate font-mono text-xs text-slate-500">/api/report-intakes/{currentIntake.id}</div>
                        <div className="truncate font-mono text-xs text-slate-500">/api/report-intakes/{currentIntake.id}/export?format=csv|xlsx</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={openActiveIntakeJson}>
                          Open JSON
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openActiveIntakeExport("csv")}>
                          Open CSV
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openActiveIntakeExport("xlsx")}>
                          Open XLSX
                        </Button>
                      </div>
                    </div>
                  </div>

                  {currentInterpreterSummaries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      No summary rows matched the current filter.
                    </div>
                  ) : (
                    <div className="overflow-auto rounded-2xl border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 text-left text-slate-600">
                          <tr className="border-b border-slate-200">
                            <th className="px-4 py-3 font-medium">Interpreter Name</th>
                            <th className="px-4 py-3 font-medium">Client</th>
                            <th className="px-4 py-3 font-medium">Client ID</th>
                            <th className="px-4 py-3 font-medium">Employee ID</th>
                            <th className="px-4 py-3 font-medium">Language</th>
                            <th className="px-4 py-3 font-medium text-right">Total Calls</th>
                            <th className="px-4 py-3 font-medium text-right">Total Minutes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentInterpreterSummaries.map((row, index) => (
                            <tr key={`${row.client}-${row.client_id}-${row.interpreter_name}-${index}`} className={`border-b border-slate-200 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                              <td className="px-4 py-3 text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span>{row.interpreter_name}</span>
                                  {!row.matched ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Unmatched</span> : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">{row.client}</td>
                              <td className="px-4 py-3 text-slate-700">{row.client_id || "-"}</td>
                              <td className="px-4 py-3 text-slate-700">{row.employee_id || "-"}</td>
                              <td className="px-4 py-3 text-slate-700">{row.language || "-"}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.total_calls)}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{formatMinutes(row.total_minutes)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {currentUnmatched.length > 0 ? (
                    <div className="grid gap-3">
                      <div className="flex items-center gap-2">
                        <Table2 className="size-4 text-slate-500" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Unmatched records</h3>
                      </div>
                      <div className="grid gap-3">
                        {currentUnmatched.map((item, index) => (
                          <div key={`${item.client}-${item.client_id}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              <span><strong>Client:</strong> {item.client}</span>
                              <span><strong>Client ID:</strong> {item.client_id || "-"}</span>
                              <span><strong>Name:</strong> {item.interpreter_name_from_report || "-"}</span>
                            </div>
                            <div className="mt-1">{item.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No saved intake is currently selected.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
