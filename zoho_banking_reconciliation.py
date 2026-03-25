import os
import re
import json
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

ZOHO_BANK_ACCOUNT_ID = os.getenv("ZOHO_BANK_ACCOUNT_ID", "").strip()
ZOHO_BANK_ACCOUNT_NAME = os.getenv("ZOHO_BANK_ACCOUNT_NAME", "").strip()
EMPLOYEE_ID_REGEX = os.getenv("EMPLOYEE_ID_REGEX", r"AS\d{4,6}")
MATCH_THRESHOLD = float(os.getenv("BANK_MATCH_THRESHOLD", "1.10"))
DATE_TOLERANCE_DAYS = int(os.getenv("DATE_TOLERANCE_DAYS", "7"))
APPLY_MATCHES = os.getenv("APPLY_BANK_MATCHES", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
PROCESS_LIMIT = int(os.getenv("BANK_PROCESS_LIMIT", "0") or "0")


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


def fetch_all_pages(token, endpoint, array_key, extra_params=None):
    rows = []
    page = 1
    while True:
        params = {
            "organization_id": ORG_ID,
            "page": page,
            "per_page": 200,
        }
        if extra_params:
            params.update(extra_params)
        resp = requests.get(
            f"{API_BASE}/{endpoint}",
            headers=get_headers(token),
            params=params,
            timeout=30,
        )
        if resp.status_code == 401:
            return None, resp.json()
        resp.raise_for_status()
        data = resp.json()
        rows.extend(data.get(array_key, []))
        if not data.get("page_context", {}).get("has_more_page", False):
            break
        page += 1
    return rows, None


def normalize(text):
    return re.sub(r"[^a-z0-9\s]", "", str(text or "").lower()).strip()


def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def extract_employee_id(text):
    match = re.search(EMPLOYEE_ID_REGEX, str(text or "").upper())
    return match.group(0) if match else ""


def looks_like_person_name(text):
    normalized = normalize(text)
    if not normalized:
        return False

    company_markers = {
        "llc",
        "inc",
        "corp",
        "co",
        "company",
        "solutions",
        "services",
        "bank",
        "systems",
        "group",
        "ltd",
    }
    tokens = [token for token in normalized.split() if token]
    if len(tokens) < 2 or len(tokens) > 6:
        return False
    if any(token in company_markers for token in tokens):
        return False
    return all(token.isalpha() for token in tokens)


def choose_first_present(item, keys):
    for key in keys:
        value = item.get(key)
        if value not in [None, ""]:
            return value
    return ""


def candidate_key(candidate):
    return (candidate["module"], candidate["record_id"])


def normalize_account_name(value):
    return normalize(value)


def candidate_matches_bank_account(candidate, bank_account_id, bank_account_name):
    candidate_account_id = str(candidate.get("bank_account_id", "") or "").strip()
    candidate_account_name = normalize_account_name(candidate.get("bank_account_name", ""))
    desired_account_name = normalize_account_name(bank_account_name)

    if candidate_account_id and bank_account_id and candidate_account_id == bank_account_id:
        return True
    if candidate_account_name and desired_account_name and candidate_account_name == desired_account_name:
        return True
    return False


def candidate_is_eligible_for_bank_account(candidate, bank_account_id, bank_account_name):
    if candidate["module"] == "journal":
        return True
    return candidate_matches_bank_account(candidate, bank_account_id, bank_account_name)


def module_to_transaction_type(module):
    mapping = {
        "vendorpayment": "vendor_payment",
        "customerpayment": "customer_payment",
        "expense": "expense",
    }
    return mapping.get(module, "")


def build_vendor_payment_rows(rows):
    normalized = []
    for row in rows:
        reference_text = " ".join(
            str(x)
            for x in [
                row.get("vendor_name", ""),
                row.get("bill_numbers", ""),
                row.get("reference_number", ""),
                row.get("payment_number", ""),
                row.get("description", ""),
            ]
            if x
        )
        normalized.append(
            {
                "module": "vendorpayment",
                "record_id": row.get("payment_id", ""),
                "amount": abs(float(row.get("amount", 0) or 0)),
                "date": row.get("date", ""),
                "party_name": row.get("vendor_name", ""),
                "reference_text": reference_text,
                "employee_id": extract_employee_id(row.get("bill_numbers", "")),
                "status": row.get("status", ""),
                "payment_number": row.get("payment_number", ""),
                "payment_mode": row.get("payment_mode", ""),
                "reference_number": row.get("reference_number", ""),
                "bank_account_id": row.get("paid_through_account_id", ""),
                "bank_account_name": row.get("paid_through_account_name", ""),
                "paid_through_account_name": row.get("paid_through_account_name", ""),
                "bill_numbers": row.get("bill_numbers", ""),
                "raw": row,
            }
        )
    return normalized


def build_expense_rows(rows):
    normalized = []
    for row in rows:
        reference_text = " ".join(
            str(x)
            for x in [
                row.get("vendor_name", ""),
                row.get("reference_number", ""),
                row.get("description", ""),
                row.get("account_name", ""),
            ]
            if x
        )
        normalized.append(
            {
                "module": "expense",
                "record_id": row.get("expense_id", ""),
                "amount": abs(float(row.get("total", row.get("amount", 0)) or 0)),
                "date": row.get("date", ""),
                "party_name": row.get("vendor_name", ""),
                "reference_text": reference_text,
                "employee_id": extract_employee_id(reference_text),
                "status": row.get("status", ""),
                "reference_number": row.get("reference_number", ""),
                "bank_account_id": "",
                "bank_account_name": row.get("paid_through_account_name", ""),
                "paid_through_account_name": row.get("paid_through_account_name", ""),
                "account_name": row.get("account_name", ""),
                "raw": row,
            }
        )
    return normalized


def build_customer_payment_rows(rows):
    normalized = []
    for row in rows:
        invoice_bits = []
        invoices = row.get("invoices", [])
        if isinstance(invoices, list):
            for invoice in invoices:
                invoice_bits.extend(
                    [
                        str(invoice.get("invoice_number", "") or ""),
                        str(invoice.get("invoice_id", "") or ""),
                    ]
                )

        invoice_numbers = choose_first_present(
            row, ["invoice_numbers", "invoice_number", "applied_invoices"]
        )
        reference_text = " ".join(
            str(x)
            for x in [
                row.get("customer_name", ""),
                invoice_numbers,
                row.get("reference_number", ""),
                row.get("payment_number", ""),
                row.get("description", ""),
                " ".join(x for x in invoice_bits if x),
            ]
            if x
        )
        normalized.append(
            {
                "module": "customerpayment",
                "record_id": row.get("payment_id", row.get("customer_payment_id", "")),
                "amount": abs(float(row.get("amount", 0) or 0)),
                "date": row.get("date", ""),
                "party_name": row.get("customer_name", ""),
                "reference_text": reference_text,
                "employee_id": extract_employee_id(reference_text),
                "status": row.get("status", ""),
                "payment_number": row.get("payment_number", ""),
                "reference_number": row.get("reference_number", ""),
                "bank_account_id": row.get("account_id", ""),
                "bank_account_name": row.get("account_name", ""),
                "raw": row,
            }
        )
    return normalized


def build_journal_rows(rows):
    normalized = []
    for row in rows:
        reference_text = " ".join(
            str(x)
            for x in [
                row.get("notes", ""),
                row.get("reference_number", ""),
                row.get("entry_number", ""),
                row.get("journal_type", ""),
            ]
            if x
        )
        normalized.append(
            {
                "module": "journal",
                "record_id": row.get("journal_id", ""),
                "amount": abs(float(row.get("total", 0) or 0)),
                "date": row.get("journal_date", row.get("date", "")),
                "party_name": row.get("notes", ""),
                "reference_text": reference_text,
                "employee_id": extract_employee_id(reference_text),
                "status": row.get("status", ""),
                "entry_number": row.get("entry_number", ""),
                "reference_number": row.get("reference_number", ""),
                "bank_account_id": "",
                "bank_account_name": "",
                "raw": row,
            }
        )
    return normalized


def build_bank_rows(rows):
    normalized = []
    for row in rows:
        description = " ".join(
            str(x)
            for x in [
                row.get("payee", ""),
                row.get("description", ""),
                row.get("reference_number", ""),
            ]
            if x
        )
        normalized.append(
            {
                "transaction_id": row.get("transaction_id", ""),
                "date": row.get("date", ""),
                "amount": abs(float(row.get("amount", 0) or 0)),
                "direction": row.get("debit_or_credit", ""),
                "description": description.strip(),
                "employee_id": extract_employee_id(description),
                "raw": row,
            }
        )
    return normalized


def fetch_matching_transactions(token, statement_id):
    resp = requests.get(
        f"{API_BASE}/banktransactions/uncategorized/{statement_id}/match",
        headers=get_headers(token),
        params={"organization_id": ORG_ID},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("matching_transactions", [])


def fetch_bank_account_name(token, account_id):
    if not account_id:
        return ""

    resp = requests.get(
        f"{API_BASE}/bankaccounts/{account_id}",
        headers=get_headers(token),
        params={"organization_id": ORG_ID},
        timeout=30,
    )
    resp.raise_for_status()
    return str(resp.json().get("bankaccount", {}).get("account_name", "") or "")


def resolve_existing_match_transaction_id(token, bank_txn, candidate):
    transaction_type = module_to_transaction_type(candidate["module"])
    if not transaction_type:
        return ""

    matches = fetch_matching_transactions(token, bank_txn["transaction_id"])
    desired_name = normalize(candidate["party_name"])
    desired_amount = round(float(bank_txn["amount"]), 2)
    desired_date = str(candidate["date"] or "")

    best_match_id = ""
    best_score = -1.0
    for match in matches:
        if match.get("transaction_type") != transaction_type:
            continue

        score = 0.0
        match_name = normalize(match.get("contact_name", ""))
        match_amount = round(float(match.get("amount", 0) or 0), 2)
        match_date = str(match.get("date", "") or "")

        if match_amount == desired_amount:
            score += 1.0
        else:
            continue

        if desired_name and match_name == desired_name:
            score += 1.0
        elif desired_name and match_name:
            score += similarity(desired_name, match_name) * 0.4

        if desired_date and match_date == desired_date:
            score += 0.5

        if match.get("is_best_match"):
            score += 0.25

        if score > best_score:
            best_score = score
            best_match_id = str(match.get("transaction_id", "") or "")

    return best_match_id


def apply_existing_match(token, bank_txn, candidate, existing_transaction_id):
    transaction_type = module_to_transaction_type(candidate["module"])
    if not transaction_type:
        raise ValueError(f"Unsupported module for API matching: {candidate['module']}")

    resp = requests.post(
        f"{API_BASE}/banktransactions/uncategorized/match",
        headers=get_headers(token),
        params={"statement_ids": bank_txn["transaction_id"]},
        data={
            "account_id": ZOHO_BANK_ACCOUNT_ID,
            "JSONString": json.dumps(
                {
                    "transactions_to_be_matched": [
                        {
                            "transaction_id": existing_transaction_id,
                            "transaction_type": transaction_type,
                        }
                    ]
                }
            ),
            "organization_id": ORG_ID,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(
            f"Zoho match failed ({resp.status_code}): {resp.text}"
        )
    return resp.json()


def score_candidate(bank_txn, candidate):
    score = 0.0

    if abs(bank_txn["amount"] - candidate["amount"]) < 0.01:
        score += 1.0
    elif abs(bank_txn["amount"] - candidate["amount"]) <= 1.0:
        score += 0.5

    bank_emp = bank_txn["employee_id"]
    candidate_emp = candidate["employee_id"]
    if bank_emp and candidate_emp and bank_emp == candidate_emp:
        score += 1.0

    bank_desc = normalize(bank_txn["description"])
    candidate_ref = normalize(candidate["reference_text"])
    party_name = normalize(candidate["party_name"])

    if party_name and party_name in bank_desc:
        score += 0.35
    elif party_name:
        score += similarity(bank_desc, party_name) * 0.25

    if candidate_ref:
        score += similarity(bank_desc, candidate_ref) * 0.20

    try:
        bank_date = pd.to_datetime(bank_txn["date"])
        candidate_date = pd.to_datetime(candidate["date"])
        date_diff = abs((bank_date - candidate_date).days)
        if date_diff <= 2:
            score += 0.25
        elif date_diff <= DATE_TOLERANCE_DAYS:
            score += 0.10
    except Exception:
        date_diff = None

    return round(score, 3)


def choose_best_candidate(bank_txn, candidates):
    best = None
    best_score = 0.0
    for candidate in candidates:
        score = score_candidate(bank_txn, candidate)
        if score > best_score:
            best_score = score
            best = candidate
    return best, best_score


def build_candidate_pool(
    direction,
    used_candidates,
    vendor_candidates,
    expense_candidates,
    customer_candidates,
    journal_candidates,
    bank_account_id,
    bank_account_name,
):
    if direction == "debit":
        ordered_candidates = vendor_candidates + expense_candidates + journal_candidates
    elif direction == "credit":
        ordered_candidates = (
            vendor_candidates
            + expense_candidates
            + customer_candidates
            + journal_candidates
        )
    else:
        return []

    return [
        candidate
        for candidate in ordered_candidates
        if candidate_key(candidate) not in used_candidates
        and candidate_is_eligible_for_bank_account(
            candidate, bank_account_id, bank_account_name
        )
    ]


def suggested_endpoint(module):
    if module == "vendorpayment":
        return "/banktransactions/uncategorized/{transaction_id}/categorize/vendorpayments"
    if module == "expense":
        return "/banktransactions/uncategorized/{transaction_id}/categorize/expenses"
    if module == "customerpayment":
        return "/banktransactions/uncategorized/{transaction_id}/categorize/customerpayments"
    return ""


def suggested_followup_action(module):
    if module == "journal":
        return "manual_journal_review"
    return "api_match_existing_transaction"


def build_audit_row(bank_txn, result, candidate):
    row = {
        "statement_id": bank_txn["transaction_id"],
        "bank_date": bank_txn["date"],
        "bank_name": bank_txn["description"],
        "bank_amount": bank_txn["amount"],
        "bank_direction": bank_txn["direction"],
        "bank_employee_id": bank_txn["employee_id"],
        "match_score": result.get("match_score", ""),
        "outcome": result.get("apply_status", "matched"),
        "zoho_type": candidate["module"],
        "zoho_date": candidate["date"],
        "zoho_name": candidate["party_name"],
        "zoho_amount": candidate["amount"],
        "zoho_status": candidate["status"],
        "zoho_reference_text": candidate["reference_text"],
        "zoho_record_id": candidate["record_id"],
        "match_transaction_id": result.get("match_transaction_id", ""),
    }

    if candidate["module"] == "vendorpayment":
        row.update(
            {
                "zoho_payment_number": candidate.get("payment_number", ""),
                "zoho_reference_number": candidate.get("reference_number", ""),
                "zoho_paid_through_account": candidate.get(
                    "paid_through_account_name", ""
                ),
                "zoho_bill_numbers": candidate.get("bill_numbers", ""),
            }
        )
    elif candidate["module"] == "customerpayment":
        row.update(
            {
                "zoho_payment_number": candidate.get("payment_number", ""),
                "zoho_reference_number": candidate.get("reference_number", ""),
                "zoho_paid_through_account": "",
                "zoho_bill_numbers": "",
            }
        )
    elif candidate["module"] == "expense":
        row.update(
            {
                "zoho_payment_number": "",
                "zoho_reference_number": candidate.get("reference_number", ""),
                "zoho_paid_through_account": candidate.get("account_name", ""),
                "zoho_bill_numbers": "",
            }
        )
    else:
        row.update(
            {
                "zoho_payment_number": candidate.get("entry_number", ""),
                "zoho_reference_number": candidate.get("reference_number", ""),
                "zoho_paid_through_account": "",
                "zoho_bill_numbers": "",
            }
        )

    return row


def main():
    if not ZOHO_BANK_ACCOUNT_ID:
        raise ValueError("ZOHO_BANK_ACCOUNT_ID is required for banking reconciliation.")

    print("=" * 60)
    print("ZOHO BANKING RECONCILIATION")
    print("=" * 60)

    print("\n[1] Authenticating with Zoho Books...")
    token = get_access_token()
    print("    Access token obtained")

    bank_account_name = ZOHO_BANK_ACCOUNT_NAME
    if not bank_account_name:
        bank_account_name = fetch_bank_account_name(token, ZOHO_BANK_ACCOUNT_ID)
    print(f"    Target bank account: {bank_account_name} ({ZOHO_BANK_ACCOUNT_ID})")

    print("\n[2] Fetching uncategorized bank transactions...")
    bank_rows, bank_error = fetch_all_pages(
        token,
        "banktransactions",
        "banktransactions",
        {"account_id": ZOHO_BANK_ACCOUNT_ID, "status": "uncategorized"},
    )
    if bank_error:
        raise Exception(f"Failed to fetch bank transactions: {bank_error}")
    bank_transactions = build_bank_rows(bank_rows)
    print(f"    Found {len(bank_transactions)} uncategorized transactions")

    print("\n[3] Fetching candidate records...")
    vendor_rows, vendor_error = fetch_all_pages(token, "vendorpayments", "vendorpayments")
    expense_rows, expense_error = fetch_all_pages(token, "expenses", "expenses")
    customer_rows, customer_error = fetch_all_pages(token, "customerpayments", "customerpayments")
    journal_rows, journal_error = fetch_all_pages(token, "journals", "journals")

    vendor_candidates = build_vendor_payment_rows(vendor_rows or [])
    expense_candidates = build_expense_rows(expense_rows or [])
    customer_candidates = build_customer_payment_rows(customer_rows or [])
    journal_candidates = build_journal_rows(journal_rows or [])

    print(f"    Vendor payments: {len(vendor_candidates)}")
    print(f"    Expenses:        {len(expense_candidates)}")
    print(f"    Customer pays:   {len(customer_candidates)}")
    print(f"    Journals:        {len(journal_candidates)}")

    scope_gaps = []
    if vendor_error:
        scope_gaps.append(f"vendorpayments: {vendor_error}")
    if expense_error:
        scope_gaps.append(f"expenses: {expense_error}")
    if customer_error:
        scope_gaps.append(f"customerpayments: {customer_error}")
    if journal_error:
        scope_gaps.append(f"journals/accountants: {journal_error}")

    if scope_gaps:
        raise RuntimeError(
            "Missing Zoho API access required for reliable reconciliation. "
            f"Fix the following scope/API gaps and rerun: {'; '.join(scope_gaps)}"
        )

    matched = []
    review = []
    unmatched = []
    audit_rows = []
    used_candidates = set()
    processed_count = 0

    transactions_to_process = bank_transactions
    if PROCESS_LIMIT > 0:
        transactions_to_process = bank_transactions[:PROCESS_LIMIT]

    total_to_process = len(transactions_to_process)

    def pct(count):
        if total_to_process == 0:
            return "0.0%"
        return f"{(count / total_to_process) * 100:.1f}%"

    print("\n[4] Matching uncategorized transactions...")
    print(f"    Mode: {'APPLY MATCHES' if APPLY_MATCHES else 'DRY RUN'}")
    print(f"    Target to process: {total_to_process}")
    print(f"    Remaining before start: {total_to_process}")
    for bank_txn in transactions_to_process:
        processed_count += 1
        remaining_count = total_to_process - processed_count
        print(
            f"\n[{processed_count}/{total_to_process}] "
            f"{bank_txn['date']} | {bank_txn['description'][:45]} | ${bank_txn['amount']:.2f}"
        )
        direction = bank_txn["direction"]
        description_looks_like_person = looks_like_person_name(bank_txn["description"])
        pool = build_candidate_pool(
            direction,
            used_candidates,
            vendor_candidates,
            expense_candidates,
            customer_candidates,
            journal_candidates,
            ZOHO_BANK_ACCOUNT_ID,
            bank_account_name,
        )

        best, score = choose_best_candidate(bank_txn, pool)
        result = {
            "transaction_id": bank_txn["transaction_id"],
            "date": bank_txn["date"],
            "amount": bank_txn["amount"],
            "direction": bank_txn["direction"],
            "bank_description": bank_txn["description"],
            "employee_id": bank_txn["employee_id"],
            "match_score": score,
            "description_looks_like_person": description_looks_like_person,
        }

        if not best:
            result["reason"] = "No candidate record available for this transaction direction"
            unmatched.append(result)
            print(f"    Status: unmatched | Remaining: {remaining_count}")
            continue

        result.update(
            {
                "matched_module": best["module"],
                "matched_record_id": best["record_id"],
                "matched_party_name": best["party_name"],
                "matched_reference_text": best["reference_text"],
                "matched_date": best["date"],
                "matched_amount": best["amount"],
                "matched_status": best["status"],
                "recommended_endpoint": suggested_endpoint(best["module"]).format(
                    transaction_id=bank_txn["transaction_id"]
                ) if suggested_endpoint(best["module"]) else "",
                "recommended_followup_action": suggested_followup_action(best["module"]),
                "match_transaction_id": "",
            }
        )

        if score >= MATCH_THRESHOLD:
            if best["module"] != "journal":
                try:
                    result["match_transaction_id"] = resolve_existing_match_transaction_id(
                        token, bank_txn, best
                    )
                except Exception as exc:
                    result["match_resolution_error"] = str(exc)

            if APPLY_MATCHES and best["module"] != "journal" and result["match_transaction_id"]:
                try:
                    apply_response = apply_existing_match(
                        token, bank_txn, best, result["match_transaction_id"]
                    )
                    result["apply_status"] = "matched"
                    result["apply_response_message"] = apply_response.get("message", "")
                except Exception as exc:
                    result["apply_status"] = "failed"
                    result["apply_error"] = str(exc)

            matched.append(result)
            audit_rows.append(build_audit_row(bank_txn, result, best))
            used_candidates.add(candidate_key(best))
            if APPLY_MATCHES:
                print(
                    f"    Status: {result.get('apply_status', 'matched')} | "
                    f"Module: {best['module']} | Score: {score} | Remaining: {remaining_count}"
                )
            else:
                print(
                    f"    Status: matched | Module: {best['module']} | "
                    f"Score: {score} | Remaining: {remaining_count}"
                )
        elif bank_txn["employee_id"] and best["employee_id"] and bank_txn["employee_id"] == best["employee_id"]:
            result["reason"] = "Employee ID matched, but confidence is below auto-match threshold"
            review.append(result)
            print(f"    Status: review | Module: {best['module']} | Score: {score} | Remaining: {remaining_count}")
        else:
            result["reason"] = "Low confidence match"
            review.append(result)
            print(f"    Status: review | Module: {best['module']} | Score: {score} | Remaining: {remaining_count}")

    output_dir = os.path.dirname(os.path.abspath(__file__))
    pd.DataFrame(matched).to_csv(
        os.path.join(output_dir, "banking_reconciliation_matched.csv"), index=False
    )
    pd.DataFrame(review).to_csv(
        os.path.join(output_dir, "banking_reconciliation_review.csv"), index=False
    )
    pd.DataFrame(unmatched).to_csv(
        os.path.join(output_dir, "banking_reconciliation_unmatched.csv"), index=False
    )
    pd.DataFrame(audit_rows).to_csv(
        os.path.join(output_dir, "banking_reconciliation_audit.csv"), index=False
    )

    print("\n" + "=" * 60)
    print("RECONCILIATION RESULTS")
    print("=" * 60)
    print(f"  Uncategorized transactions found: {len(bank_transactions)}")
    print(f"  Targeted for this run:         {total_to_process}")
    print(f"  Processed this run:            {processed_count}")
    print(f"  Remaining not processed:       {len(bank_transactions) - processed_count}")
    print(f"  Matched:                     {len(matched)} ({pct(len(matched))})")
    print(f"  Manual review:               {len(review)} ({pct(len(review))})")
    print(f"  Unmatched:                   {len(unmatched)} ({pct(len(unmatched))})")
    print("\nCSV reports saved to current folder:")
    print("  -> banking_reconciliation_matched.csv")
    print("  -> banking_reconciliation_review.csv")
    print("  -> banking_reconciliation_unmatched.csv")
    print("  -> banking_reconciliation_audit.csv")

if __name__ == "__main__":
    main()
