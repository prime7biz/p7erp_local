# Quotation UI Baseline Contract

This file freezes current quotation behavior before premium UI refactor.
It is used as a regression guardrail.

## Frontend Pages

- `frontend/src/pages/app/QuotationDetailPage.tsx`
- `frontend/src/pages/app/QuotationsPage.tsx`

## Core API Methods Used

From `frontend/src/api/client.ts`:

- `listQuotations`
- `getQuotation`
- `createQuotation`
- `updateQuotationFull`
- `deleteQuotation`
- `convertInquiryToQuotation`
- `submitQuotation`
- `approveQuotation`
- `sendQuotation`
- `reviseQuotation`
- `convertQuotationToOrder`

## Detail Page Workflow Contract

- New quotation requires customer before save.
- New flow:
  - If `inquiry_id` exists: call `convertInquiryToQuotation(...)`
  - Else: call `createQuotation(...)`
  - Then call `updateQuotationFull(...)`
- Existing flow:
  - Call `updateQuotationFull(...)`
- Edit mode:
  - New page starts editable.
  - Existing page toggles edit with button.

## Payload and Field Contract

`updateQuotationFull` body includes:

- Header fields: style, department, intermediary, shipping, commission, dates, projected quantity, currency, status, notes, ratio/pack fields.
- Arrays:
  - `materials`
  - `manufacturing`
  - `other_costs`
  - `size_ratios`

No existing field is removed during UI upgrade.

## Calculation Compatibility Contract

- Material totals use `materials[].total_amount`.
- Manufacturing totals use `manufacturing[].total_order_cost`.
- Other totals use `other_costs[].calculated_amount` fallback `other_costs[].total_amount`.
- Client auto-calculates material line:
  - `amount_per_dozen = consumption_per_dozen * unit_price`
  - `total_amount = amount_per_dozen`
- Backend remains source of truth for recomputed summary totals.

## List Page Behavior Contract

- Server-side filter and pagination:
  - `search`
  - `status`
  - `limit`/`offset`
- Actions must remain:
  - View
  - Submit/Approve/Send/Revise (status-based)
  - Delete
  - Convert to order

## Print/PDF Strategy Contract

- Browser print + Save as PDF.
- Reuse `printCurrentPage()` from `frontend/src/lib/reportExport.ts`.
- No new PDF backend dependency in this phase.
