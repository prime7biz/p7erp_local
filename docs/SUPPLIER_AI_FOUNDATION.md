# Supplier AI — Foundation Phase (Prime7 ERP)

This document records the **foundation phase** before full Supplier AI: Vendor as Supplier master, extended schema, shared AI runtime extraction, and UI/API attachment points.

## 1. Gap review (before foundation)

| Area | Previous state | Risk / constraint |
|------|----------------|-------------------|
| Domain | Supplier master lived as **`Vendor`** under Inventory (`/api/v1/inventory/vendors`) | Renaming routes or table breaks clients and PO/GRN FKs |
| Schema | `name`, `contact_person`, `email`, `phone`, `address`, `tax_id`, banking basics, `payment_terms_days`, `default_currency` | Too thin for enrichment, compliance, and structured validation |
| Customer AI | Production batch/trace/audit pattern under `customers/ai/*` | Supplier AI must reuse the same *runtime* patterns without copying DB batch tables yet |
| Frontend | `VendorsPage` + `VendorDetailDrawer` (create + view tabs + edit tab) | Keep shell; avoid clutter while adding AI hooks |

## 2. Domain strategy: Vendor = Supplier (for now)

- **Persistence:** `vendors` table / `Vendor` ORM model remains the source of truth for supplier master data.
- **API:** Unchanged base path `/api/v1/inventory/vendors` — no breaking rename in this phase.
- **Supplier AI (next phase):** Will target **`vendor_id`** (same as `Vendor.id`). Docs and new code may say “supplier” where it helps UX; backend identifiers stay `vendor_*` until a dedicated Supplier module exists.
- **Future extraction:** A dedicated `suppliers` module could introduce `Supplier` ORM + migration from `vendors` with stable external IDs; not in foundation scope.

## 3. Schema upgrade (foundation)

New nullable columns on `vendors` support master data and future AI without requiring existing rows to backfill.

**Already present (unchanged):** `vendor_code`, `name`, `contact_person`, `email`, `phone`, `address`, `country`, `city`, `tax_id`, `bank_name`, `bank_account_no`, `swift_code`, `default_currency`, `payment_terms_days`, `vendor_type`, `ledger_id`, `credit_limit`, `is_active`, timestamps.

**Added in foundation:** see Alembic revision `131` and `Vendor` / `VendorCreate` / `VendorUpdate` / `VendorOut` / frontend `Vendor*` types.

### Field classification

| Category | Fields | Notes |
|----------|--------|--------|
| ERP master (editable) | Identity, contact, address extensions, banking extras, terms, compliance/onboarding text, remarks | Normal CRUD |
| Future AI allowlist candidates | `legal_name`, `trade_name`, `website`, `mobile`, `designation`, address line/state/postal, `registration_number`, `tax_id`, banking descriptive fields, `payment_terms`, `incoterms`, `shipping_terms`, `lead_time_notes`, compliance/cert text, `remarks` | Apply only via reviewed batch + server allowlist in Supplier AI phase |
| Protected / not AI-applied | `id`, `tenant_id`, `vendor_code`, `ledger_id`, `created_at`, `updated_at`, `is_active` (unless explicit product decision), `credit_limit` | System, finance, or high-risk |

`internal_notes` is intended for staff-only text; treat as **non-AI** or highly restricted in the next phase.

## 4. Shared AI runtime (`master_data_ai`)

Low-risk helpers extracted from Customer AI (no shared suggestion-batch tables):

| Module | Role |
|--------|------|
| `app/modules/master_data_ai/sanitization.py` | Untrusted text + NL query sanitization |
| `app/modules/master_data_ai/gateway.py` | `invoke_structured_llm` (timeout, retry, structured parse) |
| `app/modules/master_data_ai/request_context.py` | Request / correlation ID for audit + logs |
| `app/modules/master_data_ai/audit_labels.py` | Human-readable labels for Customer AI audit entries |

Customer AI imports these via thin wrappers (`customer_ai_gateway`, `customer_ai_context`) so **behavior and log event names stay aligned** with the pre-foundation implementation.

## 5. Frontend foundation

- **`vendorFormShared.ts`:** Normalizes `VendorResponse` → snapshot for future AI / forms (camelCase keys aligned with likely allowlist).
- **`VendorDetailDrawer`:** New **AI** tab with a short placeholder (no live AI calls in foundation).
- Full Supplier AI UI (review panel, insights, audit) ships in the next phase.

## 6. Testing

- Sanitization / audit-label unit tests under `backend/tests/`.
- Vendor ORM / migration revision presence checks where applicable.
- Frontend unit test for `vendorFormShared` mapping (Vitest).

## 7. What remains for full Supplier AI

- `supplier_ai_*` modules: batches, router, service, RBAC, cleanup script.
- Document extraction mapping for Vendor (or reuse generic extract with vendor schema).
- `useSupplierAi` + wiring to AI tab.
- Integration tests mirroring `test_customer_ai_integration.py`.

## 8. Go / no-go after foundation

**Ready to start full Supplier AI** when this foundation is merged: extended Vendor schema + shared runtime + UI hook + docs/tests. No dependency on generic cross-module batch tables.
