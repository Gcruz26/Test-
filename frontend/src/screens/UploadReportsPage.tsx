"use client";

import { DragEvent, useEffect, useMemo, useState } from "react";
import { Banknote, FileSpreadsheet, Gauge, PhoneCall, ShieldCheck, Timer, Upload, Users2 } from "lucide-react";
import { createReportIntake } from "@/api/report-intakes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseBigPerMinuteWorkbook } from "@/lib/big-summary";
import { parseEquitiVoyceCsv } from "@/lib/equiti-voyce";
import { parsePropioSummaryWorkbook } from "@/lib/propio-summary";
import type { BigSummaryWorkbook } from "@/types/big-summary";
import type { EquitiVoyceWorkbook } from "@/types/equiti-voyce";
import type { PropioSummaryWorkbook } from "@/types/propio-summary";
import type { ClientName, ClientPlatform, ReportIntakeItem, ReportKind } from "@/types/report-intake";

const CLIENTS: readonly ClientName[] = ["Propio", "BIG", "Equiti"];
const CLIENT_PLATFORM_OPTIONS: Record<ClientName, readonly ClientPlatform[]> = {
  Equiti: ["Voyce", "Martti"],
  Propio: ["Propio Analytics"],
  BIG: ["InterpVault"],
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDurationFromSeconds(value: number) {
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function getReportKind(client: ClientName, platform: ClientPlatform): ReportKind | null {
  if (client === "Propio") return "propio_summary";
  if (client === "BIG") return "big_per_minute";
  if (client === "Equiti" && platform === "Voyce") return "equiti_voyce";
  return null;
}

function summarizeHistoryItem(item: ReportIntakeItem) {
  const interpreterSummaries = item.summary_payload.interpreter_summaries ?? [];
  const unmatchedInterpreters = item.summary_payload.unmatched_interpreters ?? [];

  if (interpreterSummaries.length > 0 || unmatchedInterpreters.length > 0) {
    return `Matched ${formatNumber(interpreterSummaries.filter((row) => row.matched).length)} • Unmatched ${formatNumber(unmatchedInterpreters.length)}`;
  }

  if (item.report_kind === "propio_summary") {
    return `Calls ${formatNumber(Number(item.summary_payload.total_calls ?? 0))} • Minutes ${formatNumber(
      Number(item.summary_payload.total_payable_minutes ?? 0),
    )}`;
  }

  if (item.report_kind === "big_per_minute") {
    return `Completed ${formatNumber(Number(item.summary_payload.completed_count ?? 0))} • Duration ${formatDurationFromSeconds(
      Number(item.summary_payload.total_duration_seconds ?? 0),
    )}`;
  }

  return `${formatNumber(item.row_count)} rows`;
}

export function UploadReportsPage() {
  const [selectedClient, setSelectedClient] = useState<ClientName>("Propio");
  const [selectedPlatform, setSelectedPlatform] = useState<ClientPlatform>("Propio Analytics");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [propioSummary, setPropioSummary] = useState<PropioSummaryWorkbook | null>(null);
  const [bigSummary, setBigSummary] = useState<BigSummaryWorkbook | null>(null);
  const [equitiVoyceSummary, setEquitiVoyceSummary] = useState<EquitiVoyceWorkbook | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedIntake, setSavedIntake] = useState<ReportIntakeItem | null>(null);
  const isPropio = selectedClient === "Propio";
  const isBig = selectedClient === "BIG";
  const isEquiti = selectedClient === "Equiti";
  const platformOptions = CLIENT_PLATFORM_OPTIONS[selectedClient];
  const hasValidDateRange = Boolean(dateRangeStart && dateRangeEnd && dateRangeEnd >= dateRangeStart);
  const canSave = Boolean(
    uploadFile && selectedPlatform && dateRangeStart && dateRangeEnd && hasValidDateRange && (propioSummary || bigSummary || equitiVoyceSummary),
  );
  const historyError = "";
  const reportIntakes: ReportIntakeItem[] = [];
  const currentIntake: ReportIntakeItem | null = null;

  const fileLabel = useMemo(() => {
    if (!uploadFile) return `Drop the ${selectedClient} file here or click to browse`;
    return `${uploadFile.name} (${Math.round(uploadFile.size / 1024)} KB)`;
  }, [uploadFile, selectedClient]);

  function onClientChange(client: ClientName) {
    setSelectedClient(client);
    setSelectedPlatform(CLIENT_PLATFORM_OPTIONS[client][0]);
    setUploadFile(null);
    setPropioSummary(null);
    setBigSummary(null);
    setEquitiVoyceSummary(null);
    setUploadError("");
    setSaveMessage("");
    setSavedIntake(null);
    setIsDragging(false);
  }

  useEffect(() => {
    if (!platformOptions.includes(selectedPlatform)) {
      setSelectedPlatform(platformOptions[0]);
    }
  }, [platformOptions, selectedPlatform]);

  async function validateAndParseFile(candidate: File | null) {
    if (!candidate) return;

    const extension = `.${candidate.name.split(".").pop()?.toLowerCase() || ""}`;
    const supportedExtensions = isBig || isEquiti ? [".csv"] : [".xlsx", ".xls", ".xlsm"];

    if (!supportedExtensions.includes(extension)) {
      setUploadError(
        isBig || isEquiti
          ? `${selectedClient} import expects a CSV file.`
          : `${selectedClient} import expects an Excel workbook.`,
      );
      return;
    }

    if (isEquiti && selectedPlatform !== "Voyce") {
      setUploadFile(candidate);
      setPropioSummary(null);
      setBigSummary(null);
      setEquitiVoyceSummary(null);
      setUploadError("Equiti Martti uploads are not implemented yet. Use Voyce for the current intake flow.");
      return;
    }

    if (!isPropio && !isBig && !isEquiti) {
      setUploadFile(candidate);
      setPropioSummary(null);
      setBigSummary(null);
      setEquitiVoyceSummary(null);
      setUploadError(`${selectedClient} uploads are enabled in the intake, but the parser and preview for this client have not been added yet.`);
      return;
    }

    setIsParsing(true);
    setUploadError("");
    setSaveMessage("");
    setSavedIntake(null);
    try {
      setUploadFile(candidate);

      if (isPropio) {
        const parsed = await parsePropioSummaryWorkbook(candidate);
        setPropioSummary(parsed);
        setBigSummary(null);
        setEquitiVoyceSummary(null);
      } else if (isBig) {
        const parsed = await parseBigPerMinuteWorkbook(candidate);
        setBigSummary(parsed);
        setPropioSummary(null);
        setEquitiVoyceSummary(null);
      } else {
        const parsed = await parseEquitiVoyceCsv(candidate);
        setEquitiVoyceSummary(parsed);
        setPropioSummary(null);
        setBigSummary(null);
      }
    } catch (err) {
      setPropioSummary(null);
      setBigSummary(null);
      setEquitiVoyceSummary(null);
      setUploadFile(candidate);
      setUploadError(
        err instanceof Error
          ? err.message
          : isBig
            ? "Failed to parse BIG workbook."
            : isEquiti
              ? "Failed to parse Equiti Voyce CSV."
            : "Failed to parse Propio workbook.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void validateAndParseFile(event.dataTransfer.files?.[0] || null);
  }

  function handleSelectIntake(_item: ReportIntakeItem) {}

  function resetForNextUpload() {
    setUploadFile(null);
    setPropioSummary(null);
    setBigSummary(null);
    setEquitiVoyceSummary(null);
    setUploadError("");
    setSaveMessage("");
    setSavedIntake(null);
    setIsDragging(false);
  }

  async function onSaveImport() {
    const reportKind = getReportKind(selectedClient, selectedPlatform);

    if (!selectedClient || !selectedPlatform || !dateRangeStart || !dateRangeEnd) {
      setUploadError("Client, start date, end date, and client platform are required.");
      return;
    }

    if (dateRangeEnd < dateRangeStart) {
      setUploadError("End date cannot be earlier than start date.");
      return;
    }

    if (!platformOptions.includes(selectedPlatform)) {
      setUploadError("Select a valid platform for the chosen client.");
      return;
    }

    if (!uploadFile || !reportKind) {
      setUploadError("Select a supported client file before saving.");
      return;
    }

    setIsSaving(true);
    setUploadError("");
    setSaveMessage("");

    try {
      const result = await createReportIntake({
        clientName: selectedClient,
        clientPlatform: selectedPlatform,
        dateRangeStart,
        dateRangeEnd,
        reportKind,
        file: uploadFile,
      });
      setSaveMessage(result.message);
      setSavedIntake(result.intake);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to save import.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,_#08111f,_#132a41_54%,_#174f60)] px-5 py-3.5 text-slate-50 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Reports Intake</h1>
          <div className="flex gap-2">
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-medium text-cyan-100">{selectedClient}</span>
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-medium text-cyan-100">{isPropio ? "Summary" : isBig ? "Per-minute" : isEquiti ? "Voyce" : "Workbook"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <div className="grid gap-1">
          <label htmlFor="client-report-source" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Client</label>
          <select
            id="client-report-source"
            value={selectedClient}
            onChange={(event) => onClientChange(event.target.value as ClientName)}
            name="client"
            autoComplete="off"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {CLIENTS.map((client) => (
              <option key={client} value={client}>{client}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="report-date-start" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Start</label>
          <input
            id="report-date-start"
            type="date"
            value={dateRangeStart}
            onChange={(event) => { setDateRangeStart(event.target.value); setUploadError(""); }}
            name="date-start"
            autoComplete="off"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            required
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="report-date-end" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">End</label>
          <input
            id="report-date-end"
            type="date"
            value={dateRangeEnd}
            min={dateRangeStart || undefined}
            onChange={(event) => { setDateRangeEnd(event.target.value); setUploadError(""); }}
            name="date-end"
            autoComplete="off"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            required
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="client-platform" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Platform</label>
          <select
            id="client-platform"
            value={selectedPlatform}
            onChange={(event) => { setSelectedPlatform(event.target.value as ClientPlatform); setUploadError(""); }}
            name="platform"
            autoComplete="off"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            required
          >
            {platformOptions.map((platform) => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 items-end gap-2">
          <label
            className={`inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 ${isDragging ? "border-blue-400 bg-blue-50 text-blue-700" : ""}`}
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            {isParsing ? "Parsing\u2026" : fileLabel}
            <input
              type="file"
              name="report-file"
              accept={isBig || isEquiti ? ".csv" : ".xlsx,.xls,.xlsm"}
              onChange={(e) => void validateAndParseFile(e.target.files?.[0] || null)}
              hidden
            />
          </label>
          <Button type="button" size="sm" disabled={isSaving || !canSave} onClick={() => void onSaveImport()} className="h-8 text-xs">
            {isSaving ? "Saving\u2026" : "Save"}
          </Button>
          {saveMessage ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{saveMessage}</span> : null}
        </div>
      </div>

          {!hasValidDateRange && dateRangeStart && dateRangeEnd ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              End date cannot be earlier than start date.
            </div>
          ) : null}

          {uploadError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</div> : null}

          {savedIntake ? (
            <Card className="border-slate-200/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-950">Report stored successfully</CardTitle>
                <CardDescription>The intake is saved. Open the dedicated summary workspace to review results and exports.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <strong className="block text-slate-950">Intake ID</strong>
                    <span>#{savedIntake.id}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <strong className="block text-slate-950">Client</strong>
                    <span>{savedIntake.client_name} • {savedIntake.client_platform}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">
                    <strong className="block text-slate-950">Period</strong>
                    <span>{formatDate(savedIntake.date_range_start)} - {formatDate(savedIntake.date_range_end)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a href={`/report-summaries/${savedIntake.id}`} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    View Summary
                  </a>
                  <Button type="button" variant="outline" onClick={resetForNextUpload}>
                    Upload Another File
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {propioSummary ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                      <Users2 className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agents</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(propioSummary.row_count)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Parsed roster rows</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                      <Gauge className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Avg Utilization</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatPercent(propioSummary.average_utilization_pct)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Across imported agents</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                      <PhoneCall className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Calls</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(propioSummary.total_calls)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">{formatCompactNumber(propioSummary.total_calls)} total activity</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                      <Timer className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Payable Minutes</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(propioSummary.total_payable_minutes)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Workbook total</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                      <FileSpreadsheet className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Portal Hours</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatHours(propioSummary.total_portal_hours)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Imported total hours</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Import details</CardTitle>
                    <CardDescription>How this workbook is classified in the app.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm text-slate-600">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Sheet detected</strong>
                      <span>{propioSummary.sheet_name}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Classification</strong>
                      <span>Propio productivity summary</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Processing rule</strong>
                      <span>Aggregated by interpreter, so it stays outside the billing transform flow.</span>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-900">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <div>
                          <strong className="block">Validated format</strong>
                          <span>Headers match the expected Propio `Export` workbook.</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Top preview rows</CardTitle>
                    <CardDescription>Quick QA sample from the imported workbook.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {propioSummary.rows.slice(0, 6).map((row) => (
                      <div key={`${row.agent}-${row.client_interpreter_id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-slate-950">{row.interpreter_name}</strong>
                            <span className="text-sm text-slate-500">{row.client_interpreter_id || "No client interpreter ID parsed"}</span>
                          </div>
                          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {formatPercent(row.utilization_pct)}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <span>Portal hours: {formatHours(row.total_portal_hours)}</span>
                          <span>Calls: {formatNumber(row.calls)}</span>
                          <span>Payable minutes: {formatNumber(row.payable_minutes)}</span>
                          <span>N/A&apos;s + Rejects: {formatNumber(row.na_count + row.rejects)}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {bigSummary ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                      <PhoneCall className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Jobs</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(bigSummary.row_count)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Imported job rows</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                      <Timer className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Duration</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatDurationFromSeconds(bigSummary.total_duration_seconds)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Total billed conversation time</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                      <ShieldCheck className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Completed</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(bigSummary.completed_count)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">{formatCompactNumber(bigSummary.completed_count)} completed calls</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                      <Users2 className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Interpreters</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(bigSummary.distinct_interpreters)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Distinct interpreter IDs</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                      <Banknote className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hold Time</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatDurationFromSeconds(bigSummary.total_hold_time_seconds)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Cumulative hold time</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Import details</CardTitle>
                    <CardDescription>How this BIG file is classified in the app.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm text-slate-600">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Detected format</strong>
                      <span>BIG transactional per-minute CSV</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Classification</strong>
                      <span>Job-level call activity report</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Processing rule</strong>
                      <span>This file is transactional, so preview totals come from job rows rather than interpreter aggregates.</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Top language</strong>
                      <span>{bigSummary.top_language}</span>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-900">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <div>
                          <strong className="block">Validated format</strong>
                          <span>Headers match the BIG per-minute CSV you provided.</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Top preview rows</CardTitle>
                    <CardDescription>Quick QA sample from the imported BIG transaction file.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {bigSummary.rows.slice(0, 6).map((row) => (
                      <div key={row.job_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-slate-950">Job {row.job_id}</strong>
                            <span className="text-sm text-slate-500">
                              Interpreter {row.interpreter_id || "Unknown"} • {row.language || "Unknown language"}
                            </span>
                          </div>
                          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {row.status || "Unknown status"}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <span>Date: {row.service_date}</span>
                          <span>Site: {row.site}</span>
                          <span>Duration: {row.duration_text || "-"}</span>
                          <span>Hold time: {row.hold_time_text || "-"}</span>
                          <span>Job type: {row.job_type || "-"}</span>
                          <span>Skill: {row.skill_type || "-"}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {equitiVoyceSummary ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                      <FileSpreadsheet className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rows</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(equitiVoyceSummary.row_count)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Imported CSV rows</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                      <Gauge className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Columns</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{formatNumber(equitiVoyceSummary.column_count)}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Detected header columns</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                      <ShieldCheck className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Platform</p>
                      <strong className="mt-2 block text-2xl tabular-nums text-slate-950">{equitiVoyceSummary.source_platform}</strong>
                      <span className="mt-1 block text-xs text-slate-500">Generic Voyce intake</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Import details</CardTitle>
                    <CardDescription>Current Equiti support stores a generic CSV intake for Voyce.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm text-slate-600">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Detected format</strong>
                      <span>Equiti Voyce CSV</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Headers</strong>
                      <span>{equitiVoyceSummary.headers.join(", ")}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <strong className="block text-slate-950">Processing rule</strong>
                      <span>This intake preserves the uploaded columns as-is until field-level Equiti mapping is defined.</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-slate-950">Top preview rows</CardTitle>
                    <CardDescription>Quick QA sample from the imported Voyce CSV.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {equitiVoyceSummary.rows.slice(0, 6).map((row, index) => (
                      <div key={`equiti-row-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="grid gap-2 text-sm text-slate-600">
                          {equitiVoyceSummary.headers.slice(0, 6).map((header) => (
                            <span key={`${index}-${header}`}>
                              <strong className="text-slate-950">{header}:</strong> {row[header] || "-"}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {false ? (
            <Card className="border-slate-200/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-950">Saved imports</CardTitle>
              <CardDescription>Latest report uploads already stored in the database.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {historyError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{historyError}</div> : null}
              {reportIntakes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No saved imports yet.
                </div>
              ) : (
                reportIntakes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectIntake(item)}
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
                          {item.client_name} • {item.client_platform} • {formatDate(item.date_range_start)} - {formatDate(item.date_range_end)}
                        </span>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {item.report_kind}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                      <span>{formatNumber(item.row_count)} rows</span>
                      <span>{summarizeHistoryItem(item)}</span>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
            </Card>
          ) : null}
    </section>
  );
}
