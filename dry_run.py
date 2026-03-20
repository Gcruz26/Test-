import os
import re
from difflib import SequenceMatcher

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# CONFIG (loaded from .env file)
# ============================================================
CLIENT_ID = os.getenv("ZOHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN")
ORG_ID = os.getenv("ZOHO_ORG_ID")
API_BASE = "https://www.zohoapis.com/books/v3"
TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"

BANK_FILE = os.getenv("BANK_FILE", "bank_transactions.xlsx")

NAME_MATCH_THRESHOLD = 0.65
REQUIRED_BANK_COLUMNS = ["Amount", "Date (UTC)"]


# ============================================================
# HELPERS
# ============================================================
def get_access_token():
    resp = requests.post(
        TOKEN_URL,
        data={
            "refresh_token": REFRESH_TOKEN,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "refresh_token",
        },
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise Exception(f"Failed to get access token: {resp.json()}")
    return token


def fetch_all_bills(token, status=None):
    """Fetch all bills from Zoho Books (paginated). No status filter = all bills."""
    bills = []
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
            f"{API_BASE}/bills",
            headers={"Authorization": f"Zoho-oauthtoken {token}"},
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()
        bills.extend(data.get("bills", []))
        if not data.get("page_context", {}).get("has_more_page", False):
            break
        page += 1
    return bills


def fetch_uncategorized_transactions(token, account_id):
    """Fetch all uncategorized bank transactions from Zoho Books."""
    txns = []
    page = 1
    while True:
        resp = requests.get(
            f"{API_BASE}/banktransactions",
            headers={"Authorization": f"Zoho-oauthtoken {token}"},
            params={
                "organization_id": ORG_ID,
                "account_id": account_id,
                "status": "uncategorized",
                "page": page,
                "per_page": 200,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        txns.extend(data.get("banktransactions", []))
        if not data.get("page_context", {}).get("has_more_page", False):
            break
        page += 1
    return txns


def extract_asid(text):
    """Extract ASID pattern like AS003381 from text."""
    match = re.search(r"(AS\d{4,6})", str(text or "").upper())
    return match.group(1) if match else None


def normalize(text):
    """Lowercase, remove special chars."""
    return re.sub(r"[^a-z0-9\s]", "", str(text or "").lower()).strip()


def similarity(a, b):
    """String similarity ratio 0-1."""
    return SequenceMatcher(None, a, b).ratio()


def get_combined_text(row):
    desc = str(row.get("Description", "") or "")
    bank_desc = str(row.get("Bank Description", "") or "")
    return f"{desc} {bank_desc}".strip()


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


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 60)
    print("DRY RUN - Transaction Categorization (No changes will be made)")
    print("=" * 60)

    # --- Auth ---
    print("\n[1] Authenticating with Zoho Books...")
    token = get_access_token()
    print("    Access token obtained")

    # --- Fetch bills (all statuses) ---
    print("\n[2] Fetching all bills from Zoho Books (paid + unpaid)...")
    raw_bills = fetch_all_bills(token)
    print(f"    Found {len(raw_bills)} total bills")

    bills_df = pd.DataFrame(
        [
            {
                "bill_id": b["bill_id"],
                "bill_number": b["bill_number"],
                "vendor": b["vendor_name"],
                "amount": float(b["total"]),
                "date": b["date"],
                "status": b["status"],
            }
            for b in raw_bills
        ]
    )

    # --- Read bank file ---
    print("\n[3] Reading bank transactions...")
    bank_df = load_bank_file(BANK_FILE)
    validate_bank_columns(bank_df)
    print(f"    Loaded {len(bank_df)} bank transactions")

    # Parse bank dates
    bank_df["Date (UTC)"] = pd.to_datetime(bank_df["Date (UTC)"])

    # --- Matching ---
    print("\n[4] Running matching logic...")

    results = []  # successful matches
    review = []  # needs manual review
    unmatched = []  # no match at all
    skipped = []  # positive amounts (incoming)

    matched_bill_ids = set()  # prevent double-matching

    for _, row in bank_df.iterrows():
        amount = float(row["Amount"])
        bank_date = row["Date (UTC)"]
        combined_text = get_combined_text(row)

        # --- Skip incoming payments ---
        if amount >= 0:
            skipped.append(
                {
                    "bank_desc": combined_text,
                    "amount": amount,
                    "date": str(bank_date.date()),
                }
            )
            continue

        abs_amount = abs(amount)
        status = None  # matched | review | unmatched - assign once

        # --- Pre-filter: bills not already matched ---
        available_bills = bills_df[~bills_df["bill_id"].isin(matched_bill_ids)]

        # ===========================================
        # 1. ASID MATCH
        # ===========================================
        asid = extract_asid(combined_text)

        if asid:
            candidates = available_bills[
                available_bills["bill_number"].str.upper().str.contains(asid, na=False)
            ]

            for _, bill in candidates.iterrows():
                if abs(bill["amount"] - abs_amount) < 0.01:
                    results.append(
                        {
                            "type": "ASID_MATCH",
                            "bank_desc": combined_text,
                            "bank_date": str(bank_date.date()),
                            "amount": amount,
                            "matched_vendor": bill["vendor"],
                            "bill_id": bill["bill_id"],
                            "bill_number": bill["bill_number"],
                            "bill_amount": bill["amount"],
                        }
                    )
                    matched_bill_ids.add(bill["bill_id"])
                    status = "matched"
                    break

            if status != "matched":
                review.append(
                    {
                        "reason": "ASID found but no amount match",
                        "bank_desc": combined_text,
                        "bank_date": str(bank_date.date()),
                        "amount": amount,
                        "asid": asid,
                    }
                )
                status = "review"

        # ===========================================
        # 2. NAME MATCH (with date proximity)
        # ===========================================
        if status is None:
            # Pre-filter by amount first
            amount_candidates = available_bills[
                abs(available_bills["amount"] - abs_amount) < 0.01
            ]

            if len(amount_candidates) == 0:
                # No bill with matching amount
                unmatched.append(
                    {
                        "bank_desc": combined_text,
                        "bank_date": str(bank_date.date()),
                        "amount": amount,
                        "reason": "No bill with matching amount",
                    }
                )
                status = "unmatched"
            else:
                best_score = 0
                best_match = None
                norm_text = normalize(combined_text)

                for _, bill in amount_candidates.iterrows():
                    norm_vendor = normalize(bill["vendor"])
                    score = similarity(norm_text, norm_vendor)

                    # Boost if vendor name appears directly in bank text
                    if norm_vendor in norm_text:
                        score += 0.2

                    # Date proximity bonus
                    try:
                        bill_date = pd.to_datetime(bill["date"])
                        date_diff = abs((bank_date - bill_date).days)
                        if date_diff <= 7:
                            score += 0.15
                        elif date_diff <= 30:
                            score += 0.05
                    except Exception:
                        pass

                    if score > best_score:
                        best_score = score
                        best_match = bill

                if best_match is not None and best_score >= NAME_MATCH_THRESHOLD:
                    results.append(
                        {
                            "type": "NAME_MATCH",
                            "bank_desc": combined_text,
                            "bank_date": str(bank_date.date()),
                            "amount": amount,
                            "matched_vendor": best_match["vendor"],
                            "bill_id": best_match["bill_id"],
                            "bill_number": best_match["bill_number"],
                            "bill_amount": best_match["amount"],
                            "score": round(best_score, 3),
                        }
                    )
                    matched_bill_ids.add(best_match["bill_id"])
                    status = "matched"
                else:
                    review.append(
                        {
                            "reason": "Low name confidence",
                            "bank_desc": combined_text,
                            "bank_date": str(bank_date.date()),
                            "amount": amount,
                            "best_score": round(best_score, 3) if best_score > 0 else 0,
                        }
                    )
                    status = "review"

    # ===========================================
    # REPORT
    # ===========================================
    print("\n" + "=" * 60)
    print("DRY RUN RESULTS")
    print("=" * 60)
    print(f"\n  Outgoing transactions:  {len(bank_df[bank_df['Amount'] < 0])}")
    print(f"  Incoming (skipped):     {len(skipped)}")
    print(f"  Matched:                {len(results)}")
    print(f"  Manual review:          {len(review)}")
    print(f"  Unmatched:              {len(unmatched)}")

    # --- Show matches ---
    if results:
        print(f"\n{'-' * 60}")
        print("MATCHED ({})".format(len(results)))
        print(f"{'-' * 60}")
        for r in results[:20]:
            print(f"  [{r['type']}] {r['bank_desc'][:50]}")
            print(f"    Bank: ${abs(r['amount']):.2f} on {r['bank_date']}")
            print(
                f"    Bill: {r['bill_number']} -- {r['matched_vendor']} -- ${r['bill_amount']:.2f}"
            )
            if r.get("score"):
                print(f"    Score: {r['score']}")
            print()

    # --- Show review ---
    if review:
        print(f"\n{'-' * 60}")
        print("MANUAL REVIEW ({})".format(len(review)))
        print(f"{'-' * 60}")
        for r in review[:20]:
            print(f"  [{r['reason']}] {r['bank_desc'][:50]}")
            print(f"    Bank: ${abs(r['amount']):.2f} on {r['bank_date']}")
            if r.get("asid"):
                print(f"    ASID: {r['asid']}")
            if r.get("best_score"):
                print(f"    Best score: {r['best_score']}")
            print()

    # --- Save to CSV ---
    output_dir = os.path.dirname(os.path.abspath(BANK_FILE))
    if results:
        pd.DataFrame(results).to_csv(
            os.path.join(output_dir, "dry_run_matched.csv"), index=False
        )
    if review:
        pd.DataFrame(review).to_csv(
            os.path.join(output_dir, "dry_run_review.csv"), index=False
        )
    if unmatched:
        pd.DataFrame(unmatched).to_csv(
            os.path.join(output_dir, "dry_run_unmatched.csv"), index=False
        )

    print(f"\nCSV reports saved to: {output_dir}")
    print("  -> dry_run_matched.csv")
    print("  -> dry_run_review.csv")
    print("  -> dry_run_unmatched.csv")
    print("\nDRY RUN COMPLETE -- No changes were made in Zoho Books")


if __name__ == "__main__":
    main()
