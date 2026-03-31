# Voucher module – baseline audit

This document records what **Prime7 ERP already implements** for vouchers so upgrade work does not duplicate features. Aligned with the adoption plan (see project notes).

## Frontend pages

| Area | File | Capabilities |
|------|------|----------------|
| List + create/edit | `frontend/src/pages/app/VouchersPage.tsx` | Multi-line DR/CR, balance check, auto-balance, copy/remove lines, draft + save-and-submit, `RemoteSearchSelect` for chart of accounts and cost centers, multi-currency + live FX, list search/status/pagination, row **Actions** dropdown, deep links `?voucher_id=` / `?edit=` |
| Approval queue | `frontend/src/pages/app/VoucherApprovalsPage.tsx` | Queue review, workflow actions, CSV + print (see implementation for data loading strategy) |
| Detail | `frontend/src/pages/app/VoucherDetailPage.tsx` | Status badge, approval stepper, voucher meta, lines, bill-wise block + auto-create bill refs, audit strip, actions |
| Print | `frontend/src/pages/app/VoucherPrintPage.tsx` | Templates (standard/compact/audit), QR, amount in words, copy labels, print / save-as-PDF (browser) |
| Analytics | `frontend/src/pages/app/VoucherAnalyticsPage.tsx` | Date/type/status filters, summary, monthly trend, top preparers, CSV + print |

## Shared UI patterns used by vouchers

- `RemoteSearchSelect` + `useRemotePaginatedSearch` + `remoteSelectFetchers.ts` (COA, cost centers; trade/BTB linked in adoption work).
- `DataTablePagination` + `useListPagination` for voucher list.
- `AppPageHeader`, `WorkflowSummaryStrip`, `LinkedRecordsSection` (applied on detail / list per adoption plan).
- `reportExport` / `exportPagedCsv` for CSV and print helpers.

## API client (`frontend/src/api/client.ts`)

- `listVouchers` / `listVouchersWithTotal` – filters, search, pagination (`X-Total-Count`).
- `createVoucher` / `updateVoucher` / `getVoucher` / `deleteVoucher`.
- `updateVoucherStatus`, `postVoucher`, `reverseVoucher`, `cancelVoucherPosting`.
- Meta: `getVoucherTypesMeta`, `getVoucherStatusesMeta`, `getVoucherApprovalRulesMeta`, `getVoucherAvailableActions`.
- `checkAccountingPeriodLock`, `getVoucherPrint`.
- Bill-wise: `listBillReferences`, `autoCreateBillRefs`.
- Trade / commercial: `listTradeCases`, `getTradeCase`, `listBtbLcs`, `getBtbLc`.

## Backend (`backend/app/modules/finance/router.py` + `backend/app/models/finance.py`)

- Workflow state machine (`VOUCHER_WORKFLOW`), posting with period check, GL impact, `cancel-posting`, `reverse` (creates reversal voucher).
- `AccountingPeriod` + `GET /accounting-periods/check-lock`.
- Bill-wise: `BillReference`, `BillAllocation`, list/create/allocate/auto-create endpoints.
- Voucher model: multi-currency fields, `trade_case_id`, `btb_lc_id`, verification/signature fields.
- Approval rules meta endpoint exists as **static** guidance text, not enforced matrix logic.

## Intentionally out of scope for “baseline”

Features described in product roadmaps but **not** implemented as full voucher subsystems: immutable per-step approver audit, finance `roles.permissions` keys for vouchers, duplicate-detection service, voucher attachments, server-rendered PDF, recurring/templates/import pipelines.

---

## Implementation pass (adoption plan)

Low-risk UX and wiring completed in code:

- **Vouchers list/create:** `AppPageHeader`, links to analytics and approval queue, accounting period lock banner via `checkAccountingPeriodLock`, searchable **Trade case** and **BTB LC** (`remoteSelectFetchers` + `RemoteSearchSelect`), optional `exchange_rate_source` on create, sticky totals bar, workflow actions with **reason modal** where appropriate (reason shown in toast; DB persistence per `docs/voucher_backend_gaps.md`), `?edit=` deep-link opens editor.
- **Voucher detail:** `AppPageHeader`, `WorkflowSummaryStrip`, `LinkedRecordsSection` (trade / BTB / bill refs), resolved labels for trade case and BTB LC, bill list load unchanged (client filter by voucher), same reason modal pattern for workflow actions.
- **Approval queue:** Merged `listVouchersWithTotal` per queue status with date range + search, client pagination, **Actions** dropdown per row, lazy-loaded available actions, reason modal for sensitive actions.
- **COA labels:** Account select shows non-posting `account_type` when present.

---

*Last updated as part of the voucher upgrade adoption implementation.*
