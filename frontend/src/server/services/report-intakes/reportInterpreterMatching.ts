import type { BigPerMinuteRow } from "@/types/big-summary";
import type { EquitiVoyceRow } from "@/types/equiti-voyce";
import type { PropioSummaryRow } from "@/types/propio-summary";
import type { ClientName, ClientPlatform, ReportIntakeInterpreterSummary, ReportIntakeUnmatchedItem, ReportKind } from "@/types/report-intake";

type InterpreterRow = {
  id: number;
  employee_id: string | null;
  full_name: string;
  language: string | null;
  propio_interpreter_id: string | null;
  big_interpreter_id: string | null;
  equiti_voyce_id: string | null;
  equiti_martti_id: string | null;
};

type NormalizedReportRow = {
  source_client: ClientName;
  source_platform: ClientPlatform;
  client_interpreter_id: string;
  interpreter_name_from_report: string;
  language_from_report: string;
  call_id: string | null;
  minutes: number;
  call_count: number;
  service_date: string | null;
};

type MatchingContext = {
  propioIdMap: Map<string, InterpreterRow>;
  bigIdMap: Map<string, InterpreterRow>;
  equityVoyceIdMap: Map<string, InterpreterRow>;
  equityMarttiIdMap: Map<string, InterpreterRow>;
};

const equitiHeaderAliases = {
  interpreterId: ["interpreter id", "interpreter_id", "provider id", "provider_id", "agent id", "agent_id", "vendor interpreter id"],
  interpreterName: ["interpreter", "interpreter name", "interpreter_name", "agent", "agent name", "provider name", "name"],
  language: ["language", "language pair", "target language", "requested language"],
  callId: ["call id", "call_id", "session id", "session_id", "interaction id", "interaction_id", "encounter id", "job id", "id"],
  minutes: ["minutes", "duration minutes", "duration_minutes", "mins", "billable minutes", "payable minutes", "total minutes"],
  duration: ["duration", "duration (hh:mm:ss)", "duration (in hh:mm:ss)", "call duration", "conversation duration"],
  serviceDate: ["service date", "service_date", "date", "date of service", "date_of_service"],
} as const;

function normalizeLookupKey(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.toLowerCase() : "";
}

function normalizeCellString(value: unknown) {
  return String(value ?? "").trim();
}

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) {
      return 0;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parseDurationToMinutes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 60 + minutes + seconds / 60;
  }

  const [minutes, seconds] = parts;
  return minutes + seconds / 60;
}

function normalizeHeaderName(value: string) {
  return value.trim().replace(/\uFEFF/g, "").replace(/\s+/g, " ").toLowerCase();
}

function getRowValue(row: EquitiVoyceRow, aliases: readonly string[]) {
  const aliasSet = new Set(aliases.map(normalizeHeaderName));

  for (const [header, value] of Object.entries(row)) {
    if (aliasSet.has(normalizeHeaderName(header))) {
      return normalizeCellString(value);
    }
  }

  return "";
}

function buildInterpreterIdMap(interpreters: InterpreterRow[], field: keyof InterpreterRow) {
  const map = new Map<string, InterpreterRow>();

  for (const interpreter of interpreters) {
    const key = normalizeLookupKey(interpreter[field]);
    if (!key || map.has(key)) {
      continue;
    }

    map.set(key, interpreter);
  }

  return map;
}

export function buildInterpreterMatchingContext(interpreters: InterpreterRow[]): MatchingContext {
  return {
    propioIdMap: buildInterpreterIdMap(interpreters, "propio_interpreter_id"),
    bigIdMap: buildInterpreterIdMap(interpreters, "big_interpreter_id"),
    equityVoyceIdMap: buildInterpreterIdMap(interpreters, "equiti_voyce_id"),
    equityMarttiIdMap: buildInterpreterIdMap(interpreters, "equiti_martti_id"),
  };
}

export function normalizeRowsForReport(params: {
  clientName: ClientName;
  clientPlatform: ClientPlatform;
  reportKind: ReportKind;
  rows: PropioSummaryRow[] | BigPerMinuteRow[] | EquitiVoyceRow[];
}): NormalizedReportRow[] {
  const { clientName, clientPlatform, reportKind, rows } = params;

  if (reportKind === "propio_summary") {
    return (rows as PropioSummaryRow[]).map((row) => ({
      source_client: clientName,
      source_platform: clientPlatform,
      client_interpreter_id: normalizeCellString(row.client_interpreter_id),
      interpreter_name_from_report: normalizeCellString(row.interpreter_name),
      language_from_report: "",
      call_id: null,
      minutes: parseNumber(row.payable_minutes),
      call_count: parseNumber(row.calls),
      service_date: null,
    }));
  }

  if (reportKind === "big_per_minute") {
    return (rows as BigPerMinuteRow[]).map((row) => ({
      source_client: clientName,
      source_platform: clientPlatform,
      client_interpreter_id: normalizeCellString(row.interpreter_id),
      interpreter_name_from_report: "",
      language_from_report: normalizeCellString(row.language),
      call_id: normalizeCellString(row.job_id) || null,
      minutes: Number((row.duration_seconds / 60).toFixed(2)),
      call_count: 1,
      service_date: normalizeCellString(row.service_date) || null,
    }));
  }

  if (reportKind === "equiti_voyce") {
    return (rows as EquitiVoyceRow[]).map((row) => {
      const durationMinutes = parseDurationToMinutes(getRowValue(row, equitiHeaderAliases.duration));
      const directMinutes = parseNumber(getRowValue(row, equitiHeaderAliases.minutes));

      return {
        source_client: clientName,
        source_platform: clientPlatform,
        client_interpreter_id: getRowValue(row, equitiHeaderAliases.interpreterId),
        interpreter_name_from_report: getRowValue(row, equitiHeaderAliases.interpreterName),
        language_from_report: getRowValue(row, equitiHeaderAliases.language),
        call_id: getRowValue(row, equitiHeaderAliases.callId) || null,
        minutes: Number((directMinutes || durationMinutes).toFixed(2)),
        call_count: 1,
        service_date: getRowValue(row, equitiHeaderAliases.serviceDate) || null,
      };
    });
  }

  return [];
}

function getLookupMap(context: MatchingContext, clientName: ClientName, clientPlatform: ClientPlatform) {
  if (clientName === "Propio") {
    return context.propioIdMap;
  }

  if (clientName === "BIG") {
    return context.bigIdMap;
  }

  if (clientName === "Equiti" && clientPlatform === "Voyce") {
    return context.equityVoyceIdMap;
  }

  if (clientName === "Equiti" && clientPlatform === "Martti") {
    return context.equityMarttiIdMap;
  }

  return new Map<string, InterpreterRow>();
}

function getUnmatchedReason(clientName: ClientName, clientPlatform: ClientPlatform) {
  if (clientName === "Propio") {
    return "No matching interpreter found by Propio ID";
  }

  if (clientName === "BIG") {
    return "No matching interpreter found by BIG ID";
  }

  if (clientName === "Equiti" && clientPlatform === "Voyce") {
    return "No matching interpreter found by Equity Voyce ID";
  }

  if (clientName === "Equiti" && clientPlatform === "Martti") {
    return "No matching interpreter found by Equity Martti ID";
  }

  return "No matching interpreter found";
}

export function buildMatchedInterpreterSummary(params: {
  clientName: ClientName;
  clientPlatform: ClientPlatform;
  normalizedRows: NormalizedReportRow[];
  matchingContext: MatchingContext;
}) {
  const { clientName, clientPlatform, normalizedRows, matchingContext } = params;
  const lookupMap = getLookupMap(matchingContext, clientName, clientPlatform);
  const unmatchedReason = getUnmatchedReason(clientName, clientPlatform);
  const summaryMap = new Map<string, ReportIntakeInterpreterSummary>();
  const unmatchedMap = new Map<string, ReportIntakeUnmatchedItem>();

  for (const row of normalizedRows) {
    const clientInterpreterId = normalizeCellString(row.client_interpreter_id);
    const lookupKey = normalizeLookupKey(clientInterpreterId);
    const matchedInterpreter = lookupKey ? lookupMap.get(lookupKey) ?? null : null;
    const summaryKey = `${matchedInterpreter?.id ?? "unmatched"}::${row.source_client}::${lookupKey || clientInterpreterId || row.interpreter_name_from_report}`;
    const current =
      summaryMap.get(summaryKey) ??
      ({
        interpreter_name: matchedInterpreter?.full_name || row.interpreter_name_from_report || "Unknown",
        client: row.source_client,
        client_id: clientInterpreterId,
        employee_id: matchedInterpreter?.employee_id ?? null,
        language: matchedInterpreter?.language || row.language_from_report || "",
        total_calls: 0,
        total_minutes: 0,
        matched: Boolean(matchedInterpreter),
      } satisfies ReportIntakeInterpreterSummary);

    current.total_calls += row.call_count;
    current.total_minutes = Number((current.total_minutes + row.minutes).toFixed(2));
    summaryMap.set(summaryKey, current);

    if (!matchedInterpreter) {
      const unmatchedItem = {
        client: row.source_client,
        client_id: clientInterpreterId,
        interpreter_name_from_report: row.interpreter_name_from_report || null,
        reason: clientInterpreterId ? unmatchedReason : "Missing client interpreter ID in uploaded row",
      } satisfies ReportIntakeUnmatchedItem;
      const unmatchedKey = [
        unmatchedItem.client,
        unmatchedItem.client_id,
        unmatchedItem.interpreter_name_from_report ?? "",
        unmatchedItem.reason,
      ].join("::");

      unmatchedMap.set(unmatchedKey, unmatchedItem);
    }
  }

  return {
    summaries: [...summaryMap.values()],
    unmatched: [...unmatchedMap.values()],
  };
}

export type { InterpreterRow, MatchingContext, NormalizedReportRow };
