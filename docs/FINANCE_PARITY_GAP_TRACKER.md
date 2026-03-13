# Finance Parity Gap Tracker (PrimeX -> P7)

Last updated: 2026-03-11

Purpose: Track what is fully replicated, what is partially matched, and what is still pending for full Finance module parity.

Status legend:
- DONE
- IN PROGRESS
- TODO

---

## P0 (Critical)

| Item | Status | Notes |
|---|---|---|
| Ledger Activity runtime stability | DONE | Fixed `account_name` vs `name` mismatch in backend and frontend account selectors. |
| Payment run execution path stability | DONE | Supplier AP account creation field mismatch fixed; stricter status gates added. |
| Finance schema availability and seedability | DONE | Migrations through `020` and `seed_finance_demo.py` working in Docker. |

---

## P1 (High parity)

| Item | Status | Notes |
|---|---|---|
| Voucher workflow depth | DONE | Added `CHECKED` and `RECOMMENDED` stages; role-aware action visibility. |
| Voucher action parity (UI driven by backend actions) | DONE | Voucher list and approval queue now use `available-actions` mapping. |
| Voucher type control | DONE | Free-text voucher type replaced by metadata dropdown. |
| Day Book voucher-type filtering | DONE | Backend filter + frontend control added. |
| Trial Balance as-of-date behavior | DONE | Added `as_of_date` support and frontend date picker. |
| Cash Flow accounting statement view | DONE | Added `/reports/cash-flow-statement` and statement mode in page. |

---

## P2 (Polish / UX parity)

| Item | Status | Notes |
|---|---|---|
| Voucher data-entry speed improvements | DONE | Added Add Debit/Credit, Auto Balance, Copy Line, Enter-to-add, next-cell Enter flow, Ctrl+D duplicate line, Ctrl+Enter create, and Ctrl+Shift+Enter create+submit. |
| Report density for accountant users | DONE | Compact mode now available on Day Book, Trial Balance, Financial Statements, Group Summary, Ratio Analysis, and Ledger Activity. |
| PrimeX-like print layout density | DONE | Shared print template classes (`no-print`, `print-only`, `print-report`, `print-card`) applied across finance reports and queues: Day Book, Trial Balance, Financial Statements, Group Summary, Ratio Analysis, Ledger Activity, Voucher Analytics, Cash Flow, AR/AP Aging, Voucher Approval Queue, and All Approvals. |
| Advanced filter parity across finance reports | DONE | Added account/group/party presets on Day Book, Trial Balance, Group Summary, Financial Statements, Ratio Analysis, and AR/AP Aging; added date/type/status presets on Voucher Analytics. |
| Generic approvals hub (cross-document) | DONE | `/app/approvals` now unifies vouchers, payment runs, bank reconciliation finalization, and accounting period close/reopen with role-aware actions, filters, print/export. |

---

## Suggested Next Completion Order

1. Execute live business UAT and update statuses in `docs/FINANCE_UAT_TEST_CASES.md` (engineering readiness report: `docs/FINANCE_UAT_CLOSURE_REPORT.md`).
2. Run business sign-off walkthrough using `docs/FINANCE_GO_LIVE_CRITERIA.md`.
3. Execute business UAT closure evidence collection and approvals sign-off packet.
4. Optional micro-polish: align status badge colors and wording across any remaining non-finance shared pages.

