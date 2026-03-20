# Zoho Books Bank Reconciliation

## Purpose

This project is for reconciling Zoho Books Banking transactions through the API.

There are now three dry-run scripts:

- `dry_run.py`
  Matches outgoing rows from a local bank statement against Zoho Books bills.
- `invoice_reconciliation.py`
  Matches incoming rows from a local bank statement against Zoho Books invoices by employee ID.
- `zoho_banking_reconciliation.py`
  Matches uncategorized transactions already present in the Zoho Books Banking module against:
  - `vendor payments` and `expenses` for withdrawals
  - `customer payments` for deposits

## Banking Reconciliation Logic

`zoho_banking_reconciliation.py` is the script closest to the workflow you described.

It does this:

1. Authenticates with Zoho Books
2. Fetches uncategorized transactions from the Banking module for `ZOHO_BANK_ACCOUNT_ID`
3. Splits them by direction using `debit_or_credit`
4. For withdrawals (`debit`), searches:
   - vendor payments
   - expenses
5. For deposits (`credit`), searches:
   - customer payments
6. Scores candidate matches using:
   - exact amount
   - employee ID extracted from the bank description
   - party name similarity
   - reference text similarity
   - date proximity
7. Generates dry-run CSVs with the suggested Zoho endpoint to use next

## Employee ID Matching

The employee ID is extracted with `EMPLOYEE_ID_REGEX`.

Examples:

- Bank description: `Payment AS003745 John Doe`
- Bill number or invoice number: `AS003745_2026-03-01`

If the same employee ID appears in both places, the script gives that match a large score boost.

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
ZOHO_CLIENT_ID=1000.your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=1000.your_refresh_token
ZOHO_ORG_ID=815234031
BANK_FILE=C:/Path/To/bank_statement.xlsx
ZOHO_BANK_ACCOUNT_ID=4236459000000092080
EMPLOYEE_ID_REGEX=AS\d{4,6}
INVOICE_MATCH_THRESHOLD=0.70
BANK_MATCH_THRESHOLD=1.10
DATE_TOLERANCE_DAYS=7
```

## Required Zoho Books Scopes

### For `zoho_banking_reconciliation.py`

Minimum read scopes:

```text
ZohoBooks.banking.READ
ZohoBooks.vendorpayments.READ
ZohoBooks.expenses.READ
ZohoBooks.customerpayments.READ
```

If you want the script to later perform the actual categorization inside Zoho Books, add:

```text
ZohoBooks.banking.CREATE
```

### Current access gap found in this workspace

The current token can read:

- bank transactions
- vendor payments

The current token is not authorized for:

- expenses
- customer payments
- invoices

Those endpoints returned:

```text
401 {"code":57,"message":"You are not authorized to perform this operation"}
```

So the full deposits/withdrawals workflow needs a new refresh token with the missing scopes.

## Running

### Banking reconciliation against Zoho Banking

```cmd
python zoho_banking_reconciliation.py
```

### Older local-bank-file bill matching

```cmd
python dry_run.py
```

### Older local-bank-file invoice matching

```cmd
python invoice_reconciliation.py
```

## Output Files

### Zoho Banking dry run

- `banking_reconciliation_matched.csv`
- `banking_reconciliation_review.csv`
- `banking_reconciliation_unmatched.csv`

### Local bank statement dry runs

- `dry_run_matched.csv`
- `dry_run_review.csv`
- `dry_run_unmatched.csv`
- `invoice_reconciliation_matched.csv`
- `invoice_reconciliation_review.csv`
- `invoice_reconciliation_unmatched.csv`

## Next Step

Once you generate a refresh token with the missing scopes, the next implementation step is straightforward:

- for withdrawals:
  call `/banktransactions/uncategorized/{transaction_id}/categorize/vendorpayments` or `/categorize/expenses`
- for deposits:
  call `/banktransactions/uncategorized/{transaction_id}/categorize/customerpayments`

The current script already outputs the recommended endpoint for each matched record.
