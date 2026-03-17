export type InterpreterStatus =
  | "Active"
  | "Inactive"
  | "On Hold"
  | "Fully Onboarded"
  | "Terminated"
  | "Deactived"
  | "Resigned";
export type PaymentFrequency = "Weekly" | "Biweekly" | "Monthly";

export interface InterpreterItem {
  id: number;
  employee_id: string;
  full_name: string;
  email: string;
  language: string;
  location: string;
  country: string;
  associated_client_id: number;
  associated_client_name: string;
  payment_frequency: PaymentFrequency;
  weekly: string;
  rate: string;
  status: InterpreterStatus;
  propio_interpreter_id: string;
  big_interpreter_id: string;
  equiti_voyce_id: string;
  equiti_martti_id: string;
  mercury_recipient_id: string;
  zoho_contact_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_error_message: string | null;
  created_at: string;
}

export interface InterpreterClientOption {
  id: number;
  name: string;
}

export interface InterpreterMetaResponse {
  clients: InterpreterClientOption[];
  payment_frequency_options: PaymentFrequency[];
  status_options: InterpreterStatus[];
}

export interface InterpreterPayload {
  employee_id: string;
  full_name: string;
  email: string;
  language: string;
  location: string;
  country: string;
  client_id: number;
  payment_frequency: PaymentFrequency;
  weekly: string;
  rate: string;
  status: InterpreterStatus;
  propio_interpreter_id: string;
  big_interpreter_id: string;
  equiti_voyce_id: string;
  equiti_martti_id: string;
  mercury_recipient_id: string;
}

export interface InterpreterFilters {
  search: string;
  full_name: string;
  employee_id: string;
  language: string;
  location: string;
  country: string;
  client_id: string;
  payment_frequency: string;
  status: string;
}

export interface InterpreterSyncResponse {
  total_fetched: number;
  eligible: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
}

export interface InterpreterSyncStatusResponse {
  last_full_sync_at: string | null;
  last_sync_status: string;
  last_sync_error_message: string | null;
  synced_records: number;
  error_records: number;
}

export interface MercuryRecipientSyncResponse {
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
}

export interface InterpreterListResponse {
  items: InterpreterItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
