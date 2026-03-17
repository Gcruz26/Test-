"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Download, Eye, Pencil, RefreshCw, Search, UserX } from "lucide-react";
import { ManageColumns } from "@/components/ManageColumns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getInterpreterMeta, getInterpreterSyncStatus, listInterpreters, syncInterpretersFromCRM, syncMercuryRecipients } from "../api/interpreters";
import type {
  InterpreterFilters,
  InterpreterItem,
  InterpreterListResponse,
  InterpreterMetaResponse,
  InterpreterSyncResponse,
  InterpreterSyncStatusResponse,
  MercuryRecipientSyncResponse,
} from "../types/interpreter";

const emptyFilters: InterpreterFilters = {
  search: "",
  full_name: "",
  employee_id: "",
  language: "",
  location: "",
  country: "",
  client_id: "",
  payment_frequency: "",
  status: "",
};

const defaultPageSize = 25;
const pageSizeOptions = [25, 50, 100];
const rosterVisibleColumnsStorageKey = "alfa-roster-visible-columns";
const searchDebounceMs = 350;

type RosterColumnKey =
  | "employee_id"
  | "full_name"
  | "email"
  | "language"
  | "location"
  | "country"
  | "associated_client_name"
  | "payment_frequency"
  | "propio_interpreter_id"
  | "big_interpreter_id"
  | "equiti_voyce_id"
  | "equiti_martti_id"
  | "mercury_recipient_id"
  | "weekly"
  | "rate"
  | "status";

type RosterColumn = {
  key: RosterColumnKey;
  label: string;
  defaultVisible: boolean;
  render: (item: InterpreterItem) => ReactNode;
  cellClassName?: string;
};

type RosterColumnFilters = {
  employeeId: string;
  fullName: string;
  email: string;
  language: string;
  location: string;
  country: string;
  client: string;
  paymentFrequency: string;
  propioId: string;
  bigId: string;
  equitiVoyceId: string;
  equitiMarttiId: string;
  mercuryRecipientId: string;
  status: string;
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildFiltersFromSearchParams(searchParams: URLSearchParams): InterpreterFilters {
  return {
    search: searchParams.get("search") ?? "",
    full_name: searchParams.get("full_name") ?? "",
    employee_id: searchParams.get("employee_id") ?? "",
    language: searchParams.get("language") ?? "",
    location: searchParams.get("location") ?? "",
    country: searchParams.get("country") ?? "",
    client_id: searchParams.get("client_id") ?? "",
    payment_frequency: searchParams.get("payment_frequency") ?? "",
    status: searchParams.get("status") ?? "",
  };
}

function hasActiveAdvancedFilters(filters: InterpreterFilters) {
  const { search: _search, ...advancedFilters } = filters;
  return Object.values(advancedFilters).some((value) => value.trim().length > 0);
}

function buildSearchQuery(filters: InterpreterFilters, page: number, pageSize: number) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const normalized = value.trim();
    if (normalized) {
      params.set(key, normalized);
    }
  });

  if (page > 1) {
    params.set("page", String(page));
  }

  if (pageSize !== defaultPageSize) {
    params.set("page_size", String(pageSize));
  }

  return params.toString();
}

function buildPageButtons(currentPage: number, totalPages: number) {
  if (totalPages <= 1) return [1];

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
  }

  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)
    .reduce<(number | "...")[]>((acc, page) => {
      const previous = acc[acc.length - 1];
      if (typeof previous === "number" && page - previous > 1) {
        acc.push("...");
      }
      acc.push(page);
      return acc;
    }, []);
}

function formatRate(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatLastSync(lastSyncedAt: string | null) {
  if (!lastSyncedAt) {
    return "Last sync: Not available";
  }

  const date = new Date(lastSyncedAt);
  if (Number.isNaN(date.getTime())) {
    return "Last sync: Not available";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Last sync: Just now";
  }
  if (diffMinutes < 60) {
    return `Last sync: ${diffMinutes} min ago`;
  }

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (now.toDateString() === date.toDateString()) {
    return `Last sync: Today at ${timeLabel}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Last sync: ${diffHours} hr ago`;
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);

  return `Last sync: ${dateLabel} at ${timeLabel}`;
}

const emptyRosterColumnFilters: RosterColumnFilters = {
  employeeId: "",
  fullName: "",
  email: "",
  language: "",
  location: "",
  country: "",
  client: "",
  paymentFrequency: "",
  propioId: "",
  bigId: "",
  equitiVoyceId: "",
  equitiMarttiId: "",
  mercuryRecipientId: "",
  status: "",
};

function normalizeFilterText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getUniqueValues<T>(data: T[], getter: (item: T) => string | null | undefined) {
  return [...new Set(data.map((item) => String(getter(item) ?? "").trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

const rosterColumns: RosterColumn[] = [
  { key: "employee_id", label: "Employee ID", defaultVisible: true, render: (item) => item.employee_id || "-" },
  { key: "full_name", label: "Full Name", defaultVisible: true, render: (item) => item.full_name, cellClassName: "font-medium text-slate-900" },
  { key: "email", label: "E-mail", defaultVisible: true, render: (item) => item.email || "-" },
  { key: "language", label: "Language", defaultVisible: true, render: (item) => item.language || "-" },
  { key: "location", label: "Location", defaultVisible: true, render: (item) => item.location || "-" },
  { key: "country", label: "Country", defaultVisible: true, render: (item) => item.country || "-" },
  { key: "associated_client_name", label: "Associated Client", defaultVisible: true, render: (item) => item.associated_client_name || "-" },
  { key: "payment_frequency", label: "Payment Frequency", defaultVisible: true, render: (item) => item.payment_frequency || "-" },
  { key: "propio_interpreter_id", label: "Propio ID", defaultVisible: false, render: (item) => item.propio_interpreter_id || "-" },
  { key: "big_interpreter_id", label: "BIG ID", defaultVisible: false, render: (item) => item.big_interpreter_id || "-" },
  { key: "equiti_voyce_id", label: "Equity Voyce ID", defaultVisible: false, render: (item) => item.equiti_voyce_id || "-" },
  { key: "equiti_martti_id", label: "Equity Martti ID", defaultVisible: false, render: (item) => item.equiti_martti_id || "-" },
  { key: "mercury_recipient_id", label: "Mercury Recipient ID", defaultVisible: false, render: (item) => item.mercury_recipient_id || "-" },
  { key: "weekly", label: "Weekly", defaultVisible: false, render: (item) => item.weekly || "-" },
  { key: "rate", label: "Rate", defaultVisible: false, render: (item) => formatRate(item.rate) },
  { key: "status", label: "Status", defaultVisible: true, render: (item) => item.status || "-" },
];

const defaultVisibleRosterColumns = rosterColumns.filter((column) => column.defaultVisible).map((column) => column.key);

function loadVisibleRosterColumns() {
  if (typeof window === "undefined") {
    return defaultVisibleRosterColumns;
  }

  try {
    const stored = window.localStorage.getItem(rosterVisibleColumnsStorageKey);
    if (!stored) {
      return defaultVisibleRosterColumns;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return defaultVisibleRosterColumns;
    }

    const validKeys = parsed.filter((value): value is RosterColumnKey => rosterColumns.some((column) => column.key === value));
    return validKeys.length > 0 ? validKeys : defaultVisibleRosterColumns;
  } catch {
    return defaultVisibleRosterColumns;
  }
}

export function InterpreterManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialFilters = useMemo(() => buildFiltersFromSearchParams(searchParams), [searchParams]);
  const initialPage = useMemo(() => parsePositiveInt(searchParams.get("page"), 1), [searchParams]);
  const initialPageSize = useMemo(() => {
    const pageSize = parsePositiveInt(searchParams.get("page_size"), defaultPageSize);
    return pageSizeOptions.includes(pageSize) ? pageSize : defaultPageSize;
  }, [searchParams]);

  const [filters, setFilters] = useState<InterpreterFilters>(emptyFilters);
  const [interpreters, setInterpreters] = useState<InterpreterItem[]>([]);
  const [pagination, setPagination] = useState<Omit<InterpreterListResponse, "items">>({
    total: 0,
    page: initialPage,
    page_size: initialPageSize,
    total_pages: 1,
  });
  const [meta, setMeta] = useState<InterpreterMetaResponse>({ clients: [], payment_frequency_options: [], status_options: [] });
  const [syncStatus, setSyncStatus] = useState<InterpreterSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [mercurySyncing, setMercurySyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [syncSummary, setSyncSummary] = useState<InterpreterSyncResponse | null>(null);
  const [mercurySummary, setMercurySummary] = useState<MercuryRecipientSyncResponse | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<RosterColumnKey[]>(defaultVisibleRosterColumns);
  const [rosterColumnFilters, setRosterColumnFilters] = useState<RosterColumnFilters>(emptyRosterColumnFilters);
  const [showFilters, setShowFilters] = useState(() => hasActiveAdvancedFilters(initialFilters));
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const skipInitialSearchRefreshRef = useRef(true);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [metaResponse, interpreterResponse, syncStatusResponse] = await Promise.all([
          getInterpreterMeta(),
          listInterpreters(initialFilters, { page: initialPage, pageSize: initialPageSize }),
          getInterpreterSyncStatus().catch(() => null),
        ]);

        setMeta(metaResponse);
        setFilters(initialFilters);
        setInterpreters(interpreterResponse.items);
        setPagination({
          total: interpreterResponse.total,
          page: interpreterResponse.page,
          page_size: interpreterResponse.page_size,
          total_pages: interpreterResponse.total_pages,
        });
        setSyncStatus(syncStatusResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interpreter module.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [initialFilters, initialPage, initialPageSize]);

  useEffect(() => {
    setVisibleColumns(loadVisibleRosterColumns());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(rosterVisibleColumnsStorageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((id) => interpreters.some((item) => item.id === id)));
  }, [interpreters]);

  useEffect(() => {
    if (skipInitialSearchRefreshRef.current) {
      skipInitialSearchRefreshRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshList(filters, 1, pagination.page_size);
    }, searchDebounceMs);

    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  const stats = useMemo(() => {
    const activeStatuses = new Set(["Active", "Fully Onboarded"]);
    const terminatedStatuses = new Set(["Inactive", "Terminated", "Deactived", "Resigned"]);

    return [
      { label: "Total Interpreters", value: pagination.total },
      { label: "Active", value: interpreters.filter((item) => activeStatuses.has(item.status)).length },
      { label: "On Hold", value: interpreters.filter((item) => item.status === "On Hold").length },
      { label: "Terminated", value: interpreters.filter((item) => terminatedStatuses.has(item.status)).length },
      { label: "Not Synced", value: interpreters.filter((item) => !item.zoho_contact_id || item.sync_status !== "synced").length },
    ];
  }, [interpreters, pagination.total]);

  const pageStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.page_size + 1;
  const pageEnd = pagination.total === 0 ? 0 : Math.min(pagination.total, pageStart + interpreters.length - 1);
  const pageButtons = buildPageButtons(pagination.page, pagination.total_pages);
  const visibleRosterColumns = useMemo(() => rosterColumns.filter((column) => visibleColumns.includes(column.key)), [visibleColumns]);
  const filteredRosterRows = useMemo(() => {
    return interpreters.filter((item) => {
      return (
        (!rosterColumnFilters.employeeId || normalizeFilterText(item.employee_id).includes(normalizeFilterText(rosterColumnFilters.employeeId))) &&
        (!rosterColumnFilters.fullName || normalizeFilterText(item.full_name).includes(normalizeFilterText(rosterColumnFilters.fullName))) &&
        (!rosterColumnFilters.email || normalizeFilterText(item.email).includes(normalizeFilterText(rosterColumnFilters.email))) &&
        (!rosterColumnFilters.language || item.language === rosterColumnFilters.language) &&
        (!rosterColumnFilters.location || item.location === rosterColumnFilters.location) &&
        (!rosterColumnFilters.country || item.country === rosterColumnFilters.country) &&
        (!rosterColumnFilters.client || item.associated_client_name === rosterColumnFilters.client) &&
        (!rosterColumnFilters.paymentFrequency || item.payment_frequency === rosterColumnFilters.paymentFrequency) &&
        (!rosterColumnFilters.propioId || normalizeFilterText(item.propio_interpreter_id).includes(normalizeFilterText(rosterColumnFilters.propioId))) &&
        (!rosterColumnFilters.bigId || normalizeFilterText(item.big_interpreter_id).includes(normalizeFilterText(rosterColumnFilters.bigId))) &&
        (!rosterColumnFilters.equitiVoyceId || normalizeFilterText(item.equiti_voyce_id).includes(normalizeFilterText(rosterColumnFilters.equitiVoyceId))) &&
        (!rosterColumnFilters.equitiMarttiId || normalizeFilterText(item.equiti_martti_id).includes(normalizeFilterText(rosterColumnFilters.equitiMarttiId))) &&
        (!rosterColumnFilters.mercuryRecipientId ||
          normalizeFilterText(item.mercury_recipient_id).includes(normalizeFilterText(rosterColumnFilters.mercuryRecipientId))) &&
        (!rosterColumnFilters.status || item.status === rosterColumnFilters.status)
      );
    });
  }, [interpreters, rosterColumnFilters]);
  const allRowsSelected = filteredRosterRows.length > 0 && filteredRosterRows.every((item) => selectedRowIds.includes(item.id));
  const hasQuery = filters.search.trim().length > 0 || hasActiveAdvancedFilters(filters);
  const hasActiveColumnFilters = Object.values(rosterColumnFilters).some((value) => value.trim().length > 0);
  const lastSyncLabel = formatLastSync(syncStatus?.last_full_sync_at ?? null);
  const languageOptions = useMemo(() => getUniqueValues(interpreters, (item) => item.language), [interpreters]);
  const locationOptions = useMemo(() => getUniqueValues(interpreters, (item) => item.location), [interpreters]);
  const countryOptions = useMemo(() => getUniqueValues(interpreters, (item) => item.country), [interpreters]);
  const clientOptions = useMemo(() => getUniqueValues(interpreters, (item) => item.associated_client_name), [interpreters]);

  function syncUrl(nextFilters: InterpreterFilters, nextPage: number, nextPageSize: number) {
    const query = buildSearchQuery(nextFilters, nextPage, nextPageSize);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function refreshList(nextFilters: InterpreterFilters, nextPage = pagination.page, nextPageSize = pagination.page_size) {
    const response = await listInterpreters(nextFilters, { page: nextPage, pageSize: nextPageSize });
    setInterpreters(response.items);
    setPagination({
      total: response.total,
      page: response.page,
      page_size: response.page_size,
      total_pages: response.total_pages,
    });
    setFilters(nextFilters);
    setSelectedRowIds([]);
    syncUrl(nextFilters, response.page, response.page_size);
  }

  async function refreshSyncStatus() {
    try {
      const response = await getInterpreterSyncStatus();
      setSyncStatus(response);
    } catch {
      setSyncStatus(null);
    }
  }

  async function applyFilters(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      await refreshList(filters, 1, pagination.page_size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interpreters.");
    }
  }

  async function handleResetFilters() {
    const nextFilters = { ...emptyFilters, search: filters.search };
    setFilters(nextFilters);
    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      await refreshList(nextFilters, 1, pagination.page_size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset filters.");
    }
  }

  async function handleSyncFromCRM() {
    setSyncing(true);
    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      const result = await syncInterpretersFromCRM();
      setSyncSummary(result);
      await Promise.all([refreshList(filters, pagination.page, pagination.page_size), refreshSyncStatus()]);
      setSuccess(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync interpreters from CRM.");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > pagination.total_pages || nextPage === pagination.page) {
      return;
    }

    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      await refreshList(filters, nextPage, pagination.page_size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change page.");
    }
  }

  async function handlePageSizeChange(nextPageSize: number) {
    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      await refreshList(filters, 1, nextPageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change page size.");
    }
  }

  function handleToggleColumn(columnKey: string) {
    setVisibleColumns((current) => {
      const typedKey = columnKey as RosterColumnKey;
      if (current.includes(typedKey)) {
        const next = current.filter((key) => key !== typedKey);
        return next.length > 0 ? next : current;
      }

      return rosterColumns.filter((column) => current.includes(column.key) || column.key === typedKey).map((column) => column.key);
    });
  }

  function handleResetVisibleColumns() {
    setVisibleColumns(defaultVisibleRosterColumns);
  }

  function updateRosterColumnFilter(field: keyof RosterColumnFilters, value: string) {
    setRosterColumnFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function clearRosterColumnFilters() {
    setRosterColumnFilters(emptyRosterColumnFilters);
  }

  function handleToggleAllRows() {
    const visibleRowIds = filteredRosterRows.map((item) => item.id);

    if (visibleRowIds.length === 0) {
      return;
    }

    if (allRowsSelected) {
      setSelectedRowIds([]);
      return;
    }

    setSelectedRowIds(visibleRowIds);
  }

  function handleToggleRow(id: number) {
    setSelectedRowIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]));
  }

  function handlePlaceholderAction(message: string) {
    setError("");
    setSuccess(message);
  }

  async function handleSyncMercuryRecipients() {
    setMercurySyncing(true);
    setError("");
    setSuccess("");
    setSyncSummary(null);
    setMercurySummary(null);

    try {
      const result = await syncMercuryRecipients();
      setMercurySummary(result);
      await refreshList(filters, pagination.page, pagination.page_size);
      setSuccess(`Mercury sync completed. Updated: ${result.updated} interpreters. Unmatched: ${result.unmatched}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync Mercury recipients.");
    } finally {
      setMercurySyncing(false);
    }
  }

  if (loading) {
    return (
      <section className="grid w-full max-w-none gap-5">
        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#08111f,_#132a41_52%,_#154c5d)] px-7 py-8 text-slate-50 shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
          <div className="grid gap-4">
            <div className="h-4 w-40 animate-pulse rounded-full bg-white/15" />
            <div className="h-10 w-72 animate-pulse rounded-full bg-white/15" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-3xl border border-white/10 bg-white/8" />
              ))}
            </div>
          </div>
        </div>
        <Card className="border-slate-200/90 bg-white/90">
          <CardContent className="p-6">
            <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid w-full max-w-none gap-5">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#08111f,_#132a41_52%,_#154c5d)] px-7 py-8 text-slate-50 shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-6">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div>
              <p className="eyebrow !text-cyan-200">Interpreter operations workspace</p>
              <h1 className="mb-3 text-4xl font-semibold tracking-tight">Interpreter Management</h1>
              <p className="max-w-3xl text-base leading-7 text-slate-200/80">
                Review the CRM roster, track sync health, and prepare interpreters for larger operational workflows.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">CRM Sync</span>
                  <strong className="mt-2 block text-lg text-white">{lastSyncLabel}</strong>
                </div>
                <div className="text-right text-sm text-cyan-50/80">
                  <div>Synced records: {syncStatus?.synced_records ?? "Not available"}</div>
                  <div>Errors: {syncStatus?.error_records ?? "Not available"}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">{stat.label}</span>
                <strong className="mt-2 block text-3xl">{stat.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search by name, employee ID, or email"
              className="h-11 rounded-xl border-slate-200 bg-white pl-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)}>
            {showFilters ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {showFilters ? "Hide filters" : "Filter roster"}
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void handleSyncFromCRM()} disabled={syncing}>
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync from CRM"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleSyncMercuryRecipients()} disabled={mercurySyncing}>
              <RefreshCw className={`size-4 ${mercurySyncing ? "animate-spin" : ""}`} />
              {mercurySyncing ? "Syncing Mercury..." : "Sync Mercury Recipients"}
            </Button>
            <span className="text-sm text-slate-500">{lastSyncLabel}</span>
          </div>
          <Button type="button" onClick={() => router.push("/interpreters/new")}>
            Create Interpreter
          </Button>
        </div>

        {showFilters ? (
          <Card className="border-slate-200/90 bg-white/90">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl text-slate-950">Filter roster</CardTitle>
              <CardDescription>Search by identity, location, client, payment cadence, and status.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" onSubmit={applyFilters}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor="filter-full-name">Full Name</Label>
                    <Input id="filter-full-name" value={filters.full_name} onChange={(e) => setFilters((current) => ({ ...current, full_name: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-employee-id">Employee ID</Label>
                    <Input id="filter-employee-id" value={filters.employee_id} onChange={(e) => setFilters((current) => ({ ...current, employee_id: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-language">Language</Label>
                    <Input id="filter-language" value={filters.language} onChange={(e) => setFilters((current) => ({ ...current, language: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-location">Location</Label>
                    <Input id="filter-location" value={filters.location} onChange={(e) => setFilters((current) => ({ ...current, location: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-country">Country</Label>
                    <Input id="filter-country" value={filters.country} onChange={(e) => setFilters((current) => ({ ...current, country: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-client">Associated Client</Label>
                    <select
                      id="filter-client"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={filters.client_id}
                      onChange={(e) => setFilters((current) => ({ ...current, client_id: e.target.value }))}
                    >
                      <option value="">All clients</option>
                      {meta.clients.map((client) => (
                        <option key={client.id} value={String(client.id)}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-payment">Payment Frequency</Label>
                    <select
                      id="filter-payment"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={filters.payment_frequency}
                      onChange={(e) => setFilters((current) => ({ ...current, payment_frequency: e.target.value }))}
                    >
                      <option value="">All frequencies</option>
                      {meta.payment_frequency_options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="filter-status">Status</Label>
                    <select
                      id="filter-status"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={filters.status}
                      onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
                    >
                      <option value="">All statuses</option>
                      {meta.status_options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit">
                    <Search className="size-4" />
                    Apply Filters
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleResetFilters()}>
                    Reset
                  </Button>
                </div>
                {syncSummary ? (
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                    Fetched {syncSummary.total_fetched}, eligible {syncSummary.eligible}, created {syncSummary.created}, updated {syncSummary.updated}, skipped {syncSummary.skipped}, errors {syncSummary.errors}.
                  </div>
                ) : null}
                {mercurySummary ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Mercury sync completed. Updated {mercurySummary.updated}, skipped existing {mercurySummary.skippedExisting}, unmatched {mercurySummary.unmatched}, duplicates {mercurySummary.duplicates}.
                  </div>
                ) : null}
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="w-full max-w-none">
        <Card className="w-full max-w-none border-slate-200/90 bg-white/90">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-xl text-slate-950">Roster browser</CardTitle>
                <CardDescription>Operational CRM view optimized for search, sync monitoring, and bulk roster actions.</CardDescription>
              </div>
              <ManageColumns
                columns={rosterColumns.map(({ key, label }) => ({ key, label }))}
                visibleColumns={visibleColumns}
                onToggleColumn={handleToggleColumn}
                onReset={handleResetVisibleColumns}
              />
            </div>
          </CardHeader>
          <CardContent className="grid w-full gap-3">
            {selectedRowIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-medium text-slate-700">{selectedRowIds.length} interpreter{selectedRowIds.length === 1 ? "" : "s"} selected</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => handlePlaceholderAction("Export selected will be wired once the bulk export flow is available.")}>
                    <Download className="size-4" />
                    Export selected
                  </Button>
                  <Button type="button" variant="outline" onClick={() => handlePlaceholderAction("Bulk status changes are not wired yet.")}>
                    Change status
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSelectedRowIds([])}>
                    Clear selection
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="text-sm text-slate-600">
                Column filters narrow the currently loaded roster rows directly from the table header.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Showing {filteredRosterRows.length} of {interpreters.length} loaded rows
                </span>
                <Button type="button" variant="outline" onClick={clearRosterColumnFilters} disabled={!hasActiveColumnFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>

            {filteredRosterRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-sm text-slate-500">
                {interpreters.length === 0
                  ? hasQuery
                    ? "No interpreters found matching your filters."
                    : "No synced interpreters available yet. Sync from CRM to begin."
                  : "No interpreters matched the current column filters on this page."}
              </div>
            ) : (
              <>
                <div className="w-full overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 font-medium">
                          <input type="checkbox" checked={allRowsSelected} onChange={handleToggleAllRows} aria-label="Select all interpreters on this page" />
                        </th>
                        {visibleRosterColumns.map((column) => (
                          <th key={column.key} className="px-4 py-3 whitespace-nowrap font-medium">
                            {column.label}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50/90 align-top">
                        <th className="px-4 py-2" />
                        {visibleRosterColumns.map((column) => (
                          <th key={`${column.key}-filter`} className="px-4 py-2">
                            {column.key === "employee_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.employeeId}
                                onChange={(event) => updateRosterColumnFilter("employeeId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "full_name" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.fullName}
                                onChange={(event) => updateRosterColumnFilter("fullName", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "email" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.email}
                                onChange={(event) => updateRosterColumnFilter("email", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "language" ? (
                              <select
                                value={rosterColumnFilters.language}
                                onChange={(event) => updateRosterColumnFilter("language", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {languageOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {column.key === "location" ? (
                              <select
                                value={rosterColumnFilters.location}
                                onChange={(event) => updateRosterColumnFilter("location", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {locationOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {column.key === "country" ? (
                              <select
                                value={rosterColumnFilters.country}
                                onChange={(event) => updateRosterColumnFilter("country", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {countryOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {column.key === "associated_client_name" ? (
                              <select
                                value={rosterColumnFilters.client}
                                onChange={(event) => updateRosterColumnFilter("client", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {clientOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {column.key === "payment_frequency" ? (
                              <select
                                value={rosterColumnFilters.paymentFrequency}
                                onChange={(event) => updateRosterColumnFilter("paymentFrequency", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {meta.payment_frequency_options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {column.key === "propio_interpreter_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.propioId}
                                onChange={(event) => updateRosterColumnFilter("propioId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "big_interpreter_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.bigId}
                                onChange={(event) => updateRosterColumnFilter("bigId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "equiti_voyce_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.equitiVoyceId}
                                onChange={(event) => updateRosterColumnFilter("equitiVoyceId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "equiti_martti_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.equitiMarttiId}
                                onChange={(event) => updateRosterColumnFilter("equitiMarttiId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "mercury_recipient_id" ? (
                              <input
                                type="text"
                                value={rosterColumnFilters.mercuryRecipientId}
                                onChange={(event) => updateRosterColumnFilter("mercuryRecipientId", event.target.value)}
                                placeholder="Search..."
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              />
                            ) : null}
                            {column.key === "status" ? (
                              <select
                                value={rosterColumnFilters.status}
                                onChange={(event) => updateRosterColumnFilter("status", event.target.value)}
                                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                              >
                                <option value="">All</option>
                                {meta.status_options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </th>
                        ))}
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRosterRows.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`border-b border-slate-200 transition hover:bg-cyan-50/50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                        >
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedRowIds.includes(item.id)}
                              onChange={() => handleToggleRow(item.id)}
                              aria-label={`Select ${item.full_name}`}
                            />
                          </td>
                          {visibleRosterColumns.map((column) => (
                            <td key={`${item.id}-${column.key}`} className={`px-4 py-3 align-top text-slate-700 ${column.cellClassName ?? ""}`.trim()}>
                              {column.render(item)}
                            </td>
                          ))}
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                aria-label="View profile"
                                title="View profile"
                                onClick={() => router.push(`/interpreters/${item.id}`)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Edit interpreter"
                                title="Edit interpreter"
                                onClick={() => router.push(`/interpreters/${item.id}/edit`)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Change status"
                                title="Change status"
                                onClick={() => handlePlaceholderAction(`Status update for ${item.full_name} is not wired yet.`)}
                              >
                                <UserX className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Showing {pageStart}-{pageEnd} of {pagination.total} interpreters.
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Label htmlFor="page-size" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Rows
                    </Label>
                    <select
                      id="page-size"
                      className="flex h-9 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={String(pagination.page_size)}
                      onChange={(e) => void handlePageSizeChange(Number(e.target.value))}
                    >
                      {pageSizeOptions.map((option) => (
                        <option key={option} value={String(option)}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={() => void handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}>
                      Previous
                    </Button>
                    <div className="flex items-center gap-2">
                      {pageButtons.map((pageButton, index) =>
                        pageButton === "..." ? (
                          <span key={`ellipsis-${index}`} className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            ...
                          </span>
                        ) : (
                          <Button
                            key={pageButton}
                            type="button"
                            variant={pageButton === pagination.page ? "default" : "outline"}
                            className="min-w-10"
                            onClick={() => void handlePageChange(pageButton)}
                            disabled={pageButton === pagination.page}
                          >
                            {pageButton}
                          </Button>
                        ),
                      )}
                    </div>
                    <Button type="button" variant="outline" onClick={() => void handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.total_pages}>
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
