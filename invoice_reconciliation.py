import os
import re
from difflib import SequenceMatcher

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("ZOHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN")
ORG_ID = os.getenv("ZOHO_ORG_ID")
API_BASE = "https://www.zohoapis.com/books/v3"
TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"

BANK_FILE = os.getenv("BANK_FILE", "bank_transactions.xlsx")
EMPLOYEE_ID_REGEX = os.getenv("EMPLOYEE_ID_REGEX", r"AS\d{4,6}")
INVOICE_MATCH_THRESHOLD = float(os.getenv("INVOICE_MATCH_THRESHOLD", "0.70"))
DATE_TOLERANCE_DAYS = int(os.getenv("DATE_TOLERANCE_DAYS", "7"))
REQUIRED_BANK_COLUMNS = ["Amount", "Date (UTC)"]


def get_access_token():
    resp = requests.post(
        TOKEN_URL,
        data={
            "refresh_token": REFRESH_TOKEN,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise Exception(f"Failed to get access token: {resp.json()}")
    return token


def get_headers(token):
    return {"Authorization": f"Zoho-oauthtoken {token}"}


def fetch_all_invoices(token, status=None):
    invoices = []
    page = 1
    while True:
        params = {
            "organization_id": ORG_ID,
            "page": page,
            "per_page": 200,
        }
        if status:
            params["status"] = status
        resp = requests.get(
            f"{API_BASE}/invoices",
            headers=get_headers(token),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        invoices.extend(data.get("invoices", []))
        if not data.get("page_context", {}).get("has_more_page", False):
            break
        page += 1
    return invoices


def fetch_uncategorized_transactions(token, account_id):
    txns = []
    page = 1
    while True:
        resp = requests.get(
            f"{API_BASE}/banktransactions",
            headers=get_headers(token),
            params={
                "organization_id": ORG_ID,
                "account_id": account_id,
                "status": "uncategorized",
                "page": page,
                "per_page": 200,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        txns.extend(data.get("banktransactions", []))
        if not data.get("page_context", {}).get("has_more_page", False):
            break
        page += 1
    return txns


def load_bank_file(path):
    _, ext = os.path.splitext(path.lower())
    if ext in [".xlsx", ".xlsm", ".xls"]:
        return pd.read_excel(path)
    if ext == ".csv":
        return pd.read_csv(path)
    raise ValueError(f"Unsupported bank file extension: {ext}")


def validate_bank_columns(df):
    missing = [col for col in REQUIRED_BANK_COLUMNS if col not in df.columns]
    if missing:
        raise ValueError(
            "Bank file is missing required columns: "
            + ", ".join(missing)
            + f". Available columns: {', '.join(str(col) for col in df.columns)}"
        )


def extract_employee_id(text):
    if not text:
        return None
    match = re.search(EMPLOYEE_ID_REGEX, str(text).upper())
    return match.group(0) if match else None


def normalize(text):
    return re.sub(r"[^a-z0-9\s]", "", str(text).lower()).strip()


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def get_combined_text(row):
    desc = str(row.get("Description", "") or "")
    bank_desc = str(row.get("Bank Description", "") or "")
    note = str(row.get("Note", "") or "")
    return " ".join(part for part in [desc, bank_desc, note] if part).strip()


def choose_invoice_match(invoice_candidates, amount, bank_date, combined_text):
    if invoice_candidates.empty:
        return None, 0.0, "No invoice candidates"

    best_score = 0.0
    best_invoice = None
    norm_text = normalize(combined_text)

    for _, invoice in invoice_candidates.iterrows():
        score = 0.0

        if abs(float(invoice["total"]) - amount) < 0.01:
            score += 1.0

        norm_customer = normalize(invoice["customer_name"])
        if norm_customer:
            score += similarity(norm_text, norm_customer) * 0.4
            if norm_customer in norm_text:
                score += 0.25

        try:
            invoice_date = pd.to_datetime(invoice["date"])
            date_diff = abs((bank_date - invoice_date).days)
            if date_diff <= DATE_TOLERANCE_DAYS:
                score += 0.25
            elif date_diff <= 30:
                score += 0.10
        except Exception:
            date_diff = None

        if score > best_score:
            best_score = score
            best_invoice = invoice

    reason = "Confidence below threshold"
    return best_invoice, round(best_score, 3), reason


def choose_bank_transaction_match(txn_candidates, amount, bank_date, combined_text):
    if txn_candidates.empty:
        return None, 0.0

    best_score = 0.0
    best_txn = None
    norm_text = normalize(combined_text)

    for _, txn in txn_candidates.iterrows():
        score = 0.0
        if abs(float(txn["amount"]) - amount) < 0.01:
            score += 1.0

        txn_text = normalize(txn["description"])
        if txn_text:
            score += similarity(norm_text, txn_text) * 0.25
            if txn_text and txn_text in norm_text:
                score += 0.15

        try:
            txn_date = pd.to_datetime(txn["date"])
            date_diff = abs((bank_date - txn_date).days)
            if date_diff <= 2:
                score += 0.20
            elif date_diff <= 7:
                score += 0.10
        except Exception:
            pass

        if score > best_score:
            best_score = score
            best_txn = txn

    return best_txn, round(best_score, 3)


def main():
    print("=" * 60)
    print("INVOICE RECONCILIATION DRY RUN")
    print("=" * 60)

    print("\n[1] Authenticating with Zoho Books...")
    token = get_access_token()
    print("    Access token obtained")

    print("\n[2] Fetching invoices from Zoho Books...")
    raw_invoices = fetch_all_invoices(token)
    print(f"    Found {len(raw_invoices)} total invoices")

    invoices_df = pd.DataFrame(
        [
            {
                "invoice_id": invoice.get("invoice_id"),
                "invoice_number": invoice.get("invoice_number", ""),
                "customer_id": invoice.get("customer_id"),
                "customer_name": invoice.get("customer_name", ""),
                "total": float(invoice.get("total", 0) or 0),
                "balance": float(invoice.get("balance", 0) or 0),
                "date": invoice.get("date"),
                "status": invoice.get("status", ""),
                "employee_id": extract_employee_id(invoice.get("invoice_number", "")),
            }
            for invoice in raw_invoices
        ]
    )

    bank_transactions_df = pd.DataFrame()
    zoho_bank_account_id = os.getenv("ZOHO_BANK_ACCOUNT_ID", "").strip()
    if zoho_bank_account_id:
        print("\n[3] Fetching uncategorized bank transactions from Zoho Books...")
        raw_bank_transactions = fetch_uncategorized_transactions(token, zoho_bank_account_id)
        print(f"    Found {len(raw_bank_transactions)} uncategorized bank transactions")
        bank_transactions_df = pd.DataFrame(
            [
                {
                    "transaction_id": txn.get("transaction_id"),
                    "date": txn.get("date"),
                    "amount": abs(float(txn.get("amount", 0) or 0)),
                    "description": txn.get("description", ""),
                }
                for txn in raw_bank_transactions
            ]
        )
    else:
        print("\n[3] Skipping Zoho bank transaction lookup (ZOHO_BANK_ACCOUNT_ID not set)")

    print("\n[4] Reading bank statement...")
    bank_df = load_bank_file(BANK_FILE)
    validate_bank_columns(bank_df)
    bank_df["Date (UTC)"] = pd.to_datetime(bank_df["Date (UTC)"])
    print(f"    Loaded {len(bank_df)} bank statement rows")

    print("\n[5] Matching incoming transactions to invoices...")
    matched = []
    review = []
    unmatched = []

    used_invoice_ids = set()
    used_bank_transaction_ids = set()

    incoming_df = bank_df[bank_df["Amount"] > 0].copy()
    if incoming_df.empty:
        print("    No incoming transactions found. Nothing to reconcile against invoices.")

    for _, row in incoming_df.iterrows():
        amount = abs(float(row["Amount"]))
        bank_date = row["Date (UTC)"]
        combined_text = get_combined_text(row)
        employee_id = extract_employee_id(combined_text)

        candidate_invoices = invoices_df.copy()
        if employee_id:
            candidate_invoices = candidate_invoices[
                candidate_invoices["employee_id"] == employee_id
            ]
        candidate_invoices = candidate_invoices[
            ~candidate_invoices["invoice_id"].isin(used_invoice_ids)
        ]

        best_invoice, score, reason = choose_invoice_match(
            candidate_invoices, amount, bank_date, combined_text
        )

        bank_txn_id = ""
        bank_txn_score = ""
        if not bank_transactions_df.empty:
            txn_candidates = bank_transactions_df[
                ~bank_transactions_df["transaction_id"].isin(used_bank_transaction_ids)
            ]
            best_bank_txn, bank_txn_score = choose_bank_transaction_match(
                txn_candidates, amount, bank_date, combined_text
            )
            if best_bank_txn is not None:
                bank_txn_id = best_bank_txn["transaction_id"]

        if best_invoice is None:
            unmatched.append(
                {
                    "bank_date": str(bank_date.date()),
                    "amount": amount,
                    "employee_id": employee_id or "",
                    "bank_desc": combined_text,
                    "reason": reason,
                    "zoho_bank_transaction_id": bank_txn_id,
                    "zoho_bank_match_score": bank_txn_score,
                }
            )
            continue

        result = {
            "bank_date": str(bank_date.date()),
            "amount": amount,
            "employee_id": employee_id or "",
            "bank_desc": combined_text,
            "invoice_id": best_invoice["invoice_id"],
            "invoice_number": best_invoice["invoice_number"],
            "customer_name": best_invoice["customer_name"],
            "invoice_total": best_invoice["total"],
            "invoice_balance": best_invoice["balance"],
            "invoice_status": best_invoice["status"],
            "match_score": score,
            "zoho_bank_transaction_id": bank_txn_id,
            "zoho_bank_match_score": bank_txn_score,
        }

        invoice_total = float(best_invoice["total"])
        invoice_balance = float(best_invoice["balance"])
        amount_matches_invoice = abs(invoice_total - amount) < 0.01
        invoice_already_paid = abs(invoice_balance) < 0.01

        if amount_matches_invoice and score >= INVOICE_MATCH_THRESHOLD:
            if invoice_already_paid:
                result["recommended_action"] = "match_bank_transaction_to_existing_payment"
            else:
                result["recommended_action"] = "create_customer_payment_then_match_bank_transaction"
            matched.append(result)
            used_invoice_ids.add(best_invoice["invoice_id"])
            if bank_txn_id:
                used_bank_transaction_ids.add(bank_txn_id)
        else:
            result["reason"] = "Amount, balance, or confidence needs review"
            review.append(result)

    output_dir = os.path.dirname(os.path.abspath(BANK_FILE))
    matched_path = os.path.join(output_dir, "invoice_reconciliation_matched.csv")
    review_path = os.path.join(output_dir, "invoice_reconciliation_review.csv")
    unmatched_path = os.path.join(output_dir, "invoice_reconciliation_unmatched.csv")

    pd.DataFrame(matched).to_csv(matched_path, index=False)
    pd.DataFrame(review).to_csv(review_path, index=False)
    pd.DataFrame(unmatched).to_csv(unmatched_path, index=False)

    print("\n" + "=" * 60)
    print("RECONCILIATION RESULTS")
    print("=" * 60)
    print(f"  Incoming transactions checked: {len(incoming_df)}")
    print(f"  Matched:                      {len(matched)}")
    print(f"  Manual review:                {len(review)}")
    print(f"  Unmatched:                    {len(unmatched)}")
    print(f"\nCSV reports saved to: {output_dir}")
    print("  -> invoice_reconciliation_matched.csv")
    print("  -> invoice_reconciliation_review.csv")
    print("  -> invoice_reconciliation_unmatched.csv")


if __name__ == "__main__":
    main()
