# Customer module — UI and backend wiring

## Scope

- List: paginated customers with server-driven facets (`GET /api/v1/customers/facets`, `GET /api/v1/customers/paginated`).
- Create / edit: BD/RMG defaults, soft recommended fields (only Legal Entity / Name hard-required), RMG buyer types, commercial defaults (`payment_terms`, `default_incoterm`, `typical_lead_time_days`, `industry_segment`, `compliance_level`, informational `credit_limit`, `notes`), non-AI `GET /customers/duplicate-check`.
- Detail: tabbed Customer 360 workspace (`?tab=overview|merch|commercial|operations|finance|contacts|portal|activity`) via `GET /api/v1/customers/{id}/360` and `GET /api/v1/customers/{id}/timeline`.
- Legacy related list still available: `GET /api/v1/customers/{id}/related` (orders / inquiries / quotations).
- Health: `GET /api/v1/customers/{id}/health` (completeness, counts, AR via `customer_id` + legacy name fallback).
- Contacts: `GET/POST /api/v1/customers/{id}/contacts`, `PATCH/DELETE /api/v1/customers/{id}/contacts/{contact_id}` (table `customer_contacts`, RLS).
- Cross-module nullable FKs (migration 334): `master_contracts`, `proforma_invoices`, `export_cases`, `delivery_challans`, `outstanding_bills` each have optional `customer_id` while keeping text snapshots (`buyer_name` / `customer_name` / `party_name`).

## Frontend

- Shared layout: `AppPageHeader`, `WorkflowSummaryStrip`, `LinkedRecordsSection` under `frontend/src/components/app/`.
- Pages: `CustomersPage.tsx`, `CustomerCreatePage.tsx`, `CustomerEditPage.tsx`, `CustomerDetailPage.tsx` (360 tabs), print `pages/print/CustomerPrintPage.tsx`.
- Form shared: `components/customers/customerFormShared.ts`, `CustomerFormFields.tsx`.
- Pickers: `RemoteSearchSelect` + `fetchCustomerPage` / `fetchActiveCustomerPage` across Parties, Portal invite, Party Ledger, Styles, Process Orders, Knitting, Bond Claim, Trade, MSC, PI, Challan.

## Rules

- KPIs and filters on the list are **backend-driven** (no hard-coded customer counts).
- Related / 360 records come **only** from tenant-scoped server APIs.
- 360 sections fail closed: unauthorized blocks return `{allowed: false}` with zero data (finance / trade / inventory / settings / AI timeline sources).
- Delivery challan QR signature payload fields are **not** changed when `customer_id` is added.
- Financial posting remains on `EXPORT_RECEIVABLE` / PartyLedger hooks; customer `credit_limit` is informational only.

## Migrations

- `333_customer_commercial_profile_and_contacts.py` (profile columns + `customer_contacts` + RLS).
- `334_cross_module_customer_fks.py` (nullable FKs + composite indexes).
- Optional backfill: `docker compose exec backend python scripts/backfill_customer_fks.py --dry-run` then `--apply`.

## Tests

```bash
docker compose exec backend pytest tests/test_customer_crud_and_contacts.py tests/test_customer_360_wiring.py tests/test_customer_module_wiring_integration.py tests/test_ai_screen_context.py tests/test_delete_guards_integration.py tests/test_rls_policies.py -q
```

## Limitations

- Receivable aging prefers `OutstandingBill.customer_id`; legacy rows without FK still match by party name aliases.
- Control Tower reverse link to customer needs `customer_id` on the Control Tower row payload when the API exposes it.
