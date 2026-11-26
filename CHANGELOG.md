# Changelog

All notable changes to Ledger are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 26/11/2026

### Added
- Accounts of five types (asset, liability, income, expense, equity) and proper double-entry
  transactions: a transaction whose debits do not equal its credits **cannot be saved**, and the
  refusal shows both totals.
- **Net worth** as assets minus liabilities, always derived from the ledger, never stored.
- A **balance sheet** whose totals agree with the sum of its own rows, and an **income/expense**
  report whose net is income minus expense.
- Budgets and repeat rules evaluated on device. A due repeat is listed; **nothing is posted by
  itself**, because a ledger that posts by itself is a ledger you cannot trust.
- Full **JSON export and import**, with identical totals after a round trip.
- Money as **integer paise** throughout: ₹1,000 is 100000 paise, and 4.35 is exactly 435.
- Refusals: no amount, an unparseable amount (with the value shown), no date (rather than dated
  today), an impossible date, a zero amount, an unknown account, a line that is neither debit nor
  credit, a budget on a non-expense account.
- Two identical transactions are **both kept and flagged** as duplicates — merging would be a lie
  about the money.
- An unreadable ledger is reported and offered for export; it is never rebuilt from a partial read,
  and a ledger containing an unbalanced transaction is refused at the transaction that fails.
- A failed save says the balance does **not** include the entry.
- PWA shell, CI (88 engine assertions + 20 in jsdom + page smoke), and the app-builder pipeline
  pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- Reading a receipt photo: there is no OCR in this estate, so entries are typed.
