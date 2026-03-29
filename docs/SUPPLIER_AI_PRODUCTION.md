# Supplier AI (production) — Vendor master

This document describes the **full Supplier AI** implementation on the existing **Vendor** supplier master. For schema/foundation notes, see [SUPPLIER_AI_FOUNDATION.md](./SUPPLIER_AI_FOUNDATION.md).

## Architecture reuse (Customer AI)

| Concern | Customer AI | Supplier (Vendor) AI |
|--------|-------------|----------------------|
| Field batches | `CustomerAiSuggestionBatch` / `Item` | `VendorAiSuggestionBatch` / `Item` |
| Trace-only batches | `validate`, `dedupe`, `summary`, `next_actions` | Same action types |
| Apply / discard / mark | `customer_ai_batches` | `vendor_ai_batches` |
| Finalize after create | `finalize_batch_after_create` (audit + disposition) | Same pattern |
| Gateway / tracing | `master_data_ai` request context | Same |
| Frontend review | `AutofillReviewPanel`, hooks, create vs edit | `VendorDetailDrawer` AI tab + create section |

HTTP base path for vendor AI: **`/api/v1/inventory/vendors/ai/*`** (inventory router prefix).

## Vendor as supplier

The ERP **supplier master** is the **`vendors`** row. There is no separate `suppliers` table in this phase. Purchase orders and inventory flows keep using `vendor_id`.

## Action types

**Field-suggestion (persistent items, apply/mark/discard):**

- `extract` — document / image extraction into allowlisted camelCase fields  
- `enrich` — website / hints / structured suggestions  

**Trace-only (auditable batch + `meta_json`, no field apply):**

- `validate` — rules-based profile / banking / compliance scores + issues  
- `dedupe` — tenant-scoped similarity search  
- `summary` — LLM structured summary (when provider configured)  
- `next_actions` — LLM structured procurement/finance/compliance ideas  

## Allowlisted AI fields (camelCase)

Aligned with `vendor_ai_batches.ALLOWED_FORM_KEYS` and `frontend/.../vendorFormShared.ts`:

`vendorDisplayName`, `legalName`, `tradeName`, `contactPerson`, `designation`, `email`, `phone`, `mobile`, `website`, `address`, `addressLine1`, `city`, `stateOrRegion`, `postalCode`, `country`, `taxId`, `registrationNumber`, `vendorType`, `defaultCurrency`, `paymentTermsDays`, `paymentTerms`, `incoterms`, `shippingTerms`, `leadTimeNotes`, `bankName`, `bankAccountTitle`, `bankAccountNo`, `swiftCode`, `iban`, `complianceStatus`, `complianceReferenceNumbers`, `certificationsSummary`, `onboardingStatus`, `remarks`.

## Protected / system-controlled fields

Not allowlisted for AI apply (examples):

- `vendor_code` — stable business key; not written by AI suggestion apply  
- `ledger_id`, `credit_limit`, `internal_notes` — finance/system; not in allowlist  
- Tenant IDs, primary keys, audit timestamps  

`vendorDisplayName` maps to ORM `name` on apply.

## RBAC (`Role.permissions` JSON)

Missing key ⇒ allow (same convention as Customer AI). Explicit `false` denies.

| Capability | Permission key |
|------------|----------------|
| Extract | `inventory.vendors.ai.extract` |
| Enrich | `inventory.vendors.ai.enrich` |
| Validate | `inventory.vendors.ai.validate` |
| Dedupe | `inventory.vendors.ai.dedupe` |
| Summary | `inventory.vendors.ai.summary` |
| Next actions | `inventory.vendors.ai.next_actions` |
| Audit log | `inventory.vendors.ai.audit` |
| Apply suggestions | `inventory.vendors.ai.apply_suggestions` |
| Discard | `inventory.vendors.ai.discard_suggestions` |

Nested object `inventory.vendors.ai` truthy can be used to grant the subtree (see `vendor_ai_authz.py`).

Roles `admin`, `manager`, `owner`, `super_admin`, `superadmin` bypass granular checks when AI module access is allowed.

## Audit behavior

- Suggestion lifecycle: `VENDOR_AI_SUGGESTION_BATCH`, `VENDOR_AI_SUGGESTION_MARKED`, `VENDOR_AI_SUGGESTION_APPLY`, `VENDOR_AI_SUGGESTION_DISCARD`, `VENDOR_AI_SUGGESTION_LINK`, `VENDOR_AI_SUGGESTION_FINALIZE_CREATE`  
- Operations: `VENDOR_AI_EXTRACT`, `VENDOR_AI_ENRICH`, `VENDOR_AI_VALIDATE`, `VENDOR_AI_DEDUPE`, `VENDOR_AI_SUMMARY`, `VENDOR_AI_NEXT_ACTIONS`  
- Prompt category: `vendor_ai` (for filtering in tooling)

## Retention / cleanup

Batch expiry uses **`customer_ai_batch_retention_days`** from app settings (shared knob with Customer AI until a dedicated setting exists).

Dry-run cleanup helper:

- `vendor_ai_batches.cleanup_expired_vendor_ai_batches(db, dry_run=True)`

## Frontend

- **VendorsPage** — create handler returns new vendor `id` for finalize-after-create; list refresh syncs `selectedVendor` when the drawer is open.  
- **VendorDetailDrawer** — AI tab: `VendorAiPanel`, `AutofillReviewPanel` (extract/enrich), validate/dedupe/summary/next-actions cards, apply conflicts, audit list. Create flow: same AI block above submit; merge into `VendorCreate` then finalize batches after create.

## Test commands (Docker)

```bash
docker compose exec backend pytest tests/test_vendor_foundation.py tests/test_vendor_ai_integration.py -v
```

Integration tests require PostgreSQL (`db_session_integration`).

## Known limitations

- Summary and next-actions require a working LLM provider; validate/dedupe are usable without LLM.  
- Create-mode finalize records audit and batch disposition; the create **payload** must already include user-accepted values merged in the form (same as Customer AI).  
- API path is under **inventory** (`/inventory/vendors/ai/...`), not a top-level `/vendors` router.

## What remains before Inquiry AI

- Optional: dedicated `vendor_ai_batch_retention_days` and cleanup script mirroring customer batches.  
- Inquiry module: extraction/batch model for **inquiry lines** and RFQ-specific allowlists; reuse `master_data_ai` tracing and the same review-first UX patterns.  
- NL search / list assistants for vendors (if desired) — not in scope for this vendor drawer delivery.

**Inquiry AI** can start after this: shared runtime and patterns are in place; new work is mostly inquiry-specific schemas, batches, and UI entry points (e.g. inquiry create/detail), without blocking on a separate supplier table.
