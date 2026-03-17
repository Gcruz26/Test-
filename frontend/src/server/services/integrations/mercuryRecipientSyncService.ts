import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { listRecipients, type MercuryRecipient } from "./mercuryClient";

type InterpreterEmailRow = {
  id: number;
  email: string | null;
  mercury_recipient_id: string | null;
};

type MercuryRecipientSyncSummary = {
  success: true;
  totalRecipients: number;
  matched: number;
  updated: number;
  skippedExisting: number;
  unmatched: number;
  duplicates: number;
  unmatchedEmails: string[];
  duplicateEmails: string[];
  errors: string[];
};

const interpreterPageSize = 1000;
const updateChunkSize = 25;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

async function logMercuryEvent(level: "INFO" | "WARNING" | "ERROR", eventType: string, message: string, detail?: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  await admin.from("integration_logs").insert({
    integration_name: "mercury",
    level,
    event_type: eventType,
    message,
    detail: detail ?? null,
  });
}

async function listInterpreterEmails() {
  const admin = createSupabaseAdminClient();
  const rows: InterpreterEmailRow[] = [];
  let from = 0;

  while (true) {
    const to = from + interpreterPageSize - 1;
    const { data, error } = await admin
      .from("interpreters")
      .select("id, email, mercury_recipient_id")
      .order("id", { ascending: true })
      .range(from, to)
      .returns<InterpreterEmailRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < interpreterPageSize) {
      break;
    }

    from += interpreterPageSize;
  }

  return rows;
}

async function applyRecipientUpdates(updates: Array<{ interpreterId: number; mercuryRecipientId: string }>, force: boolean) {
  const admin = createSupabaseAdminClient();
  let updated = 0;
  const errors: string[] = [];

  for (let index = 0; index < updates.length; index += updateChunkSize) {
    const chunk = updates.slice(index, index + updateChunkSize);
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        let query = admin
          .from("interpreters")
          .update({ mercury_recipient_id: item.mercuryRecipientId })
          .eq("id", item.interpreterId);

        if (!force) {
          query = query.is("mercury_recipient_id", null);
        }

        const { error } = await query;

        if (error) {
          throw new Error(`Interpreter ${item.interpreterId}: ${error.message}`);
        }
      }),
    );

    settled.forEach((result) => {
      if (result.status === "fulfilled") {
        updated += 1;
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : "Failed to update Mercury recipient ID.");
      }
    });
  }

  return { updated, errors };
}

function buildRecipientEmailMap(recipients: MercuryRecipient[]) {
  const map = new Map<string, MercuryRecipient[]>();

  for (const recipient of recipients) {
    const key = normalizeEmail(recipient.email);
    const current = map.get(key) ?? [];
    current.push(recipient);
    map.set(key, current);
  }

  return map;
}

function buildInterpreterEmailMap(interpreters: InterpreterEmailRow[]) {
  const map = new Map<string, InterpreterEmailRow[]>();

  for (const interpreter of interpreters) {
    if (!interpreter.email?.trim()) {
      continue;
    }

    const key = normalizeEmail(interpreter.email);
    const current = map.get(key) ?? [];
    current.push(interpreter);
    map.set(key, current);
  }

  return map;
}

export async function syncMercuryRecipientIds(force = false): Promise<MercuryRecipientSyncSummary> {
  const recipients = await listRecipients();
  const interpreters = await listInterpreterEmails();
  const recipientEmailMap = buildRecipientEmailMap(recipients);
  const interpreterEmailMap = buildInterpreterEmailMap(interpreters);
  const updates: Array<{ interpreterId: number; mercuryRecipientId: string }> = [];
  const unmatchedEmails: string[] = [];
  const duplicateEmails: string[] = [];
  const errors: string[] = [];
  let matched = 0;
  let skippedExisting = 0;
  let duplicates = 0;

  for (const [email, mercuryRecipients] of recipientEmailMap.entries()) {
    if (mercuryRecipients.length > 1) {
      duplicates += 1;
      duplicateEmails.push(email);
      continue;
    }

    const interpretersForEmail = interpreterEmailMap.get(email) ?? [];
    if (interpretersForEmail.length === 0) {
      unmatchedEmails.push(email);
      continue;
    }

    if (interpretersForEmail.length > 1) {
      duplicates += 1;
      duplicateEmails.push(email);
      continue;
    }

    matched += 1;
    const interpreter = interpretersForEmail[0];
    const recipient = mercuryRecipients[0];

    if (interpreter.mercury_recipient_id && !force) {
      skippedExisting += 1;
      continue;
    }

    if (interpreter.mercury_recipient_id === recipient.id) {
      skippedExisting += 1;
      continue;
    }

    updates.push({
      interpreterId: interpreter.id,
      mercuryRecipientId: recipient.id,
    });
  }

  const updateResult = await applyRecipientUpdates(updates, force);
  errors.push(...updateResult.errors);

  if (duplicateEmails.length > 0) {
    await logMercuryEvent("WARNING", "recipient_id_sync_duplicates", "Mercury recipient sync detected duplicate emails.", {
      duplicateEmails: uniqueStrings(duplicateEmails),
    });
  }

  if (unmatchedEmails.length > 0) {
    await logMercuryEvent("INFO", "recipient_id_sync_unmatched", "Mercury recipient sync found unmatched emails.", {
      unmatchedEmails: uniqueStrings(unmatchedEmails),
    });
  }

  await logMercuryEvent(errors.length > 0 ? "WARNING" : "INFO", "recipient_id_sync", "Mercury recipient ID sync completed.", {
    totalRecipients: recipients.length,
    matched,
    updated: updateResult.updated,
    skippedExisting,
    unmatched: uniqueStrings(unmatchedEmails).length,
    duplicates,
    errors,
  });

  return {
    success: true,
    totalRecipients: recipients.length,
    matched,
    updated: updateResult.updated,
    skippedExisting,
    unmatched: uniqueStrings(unmatchedEmails).length,
    duplicates,
    unmatchedEmails: uniqueStrings(unmatchedEmails),
    duplicateEmails: uniqueStrings(duplicateEmails),
    errors,
  };
}

export type { MercuryRecipientSyncSummary };
