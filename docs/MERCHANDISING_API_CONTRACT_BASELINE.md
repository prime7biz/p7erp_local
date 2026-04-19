# Merchandising — API contract baseline (must not break)

**Purpose:** Refactor/migration safety net. Paths and core response shapes listed here must stay stable unless versioned.

**Base URL:** `/api/v1` (see `settings.api_v1_prefix`).

## Inquiries

- `GET/POST /inquiries`, `GET/PATCH/DELETE /inquiries/{id}` — tenant-scoped; 404 if wrong tenant.
- `POST /inquiries/ai/*` — extract, enrich, validate, suggestion batches; tenant + capability checks.
- **Must not break:** JSON field names on `Inquiry` list/detail; status transition errors (400) for invalid transitions.

## Quotations

- `GET/POST /quotations`, `GET/PATCH/DELETE /quotations/{id}`, `POST /quotations/from-inquiry/{id}`.
- `PATCH /quotations/{id}` — `QuotationUpdate` schema only; protected commercial fields return **409** with `COMMERCIAL_CHANGE_REQUIRED` when status in locked set.
- `POST /quotations/ai/*` — costing intelligence, suggestion batches; audit endpoints.
- `POST /quotations/ai/extract` — multipart `file` + optional `quotation_id` (Form); returns `QuotationAiExtractWrapResponse` (`extraction` + `suggestion_batch_id`); capability `quotations.ai.extract`; wrong-tenant `quotation_id` → **404**.
- **Must not break:** 409 shape for locked-field PATCH; full PUT costing behavior for workspace.

## Orders

- `GET/POST /orders`, `GET/PATCH /orders/{id}`, `POST /orders/from-quotation/{id}`.
- `GET /orders/{id}/commercial-alignment` — read-only comparison vs snapshot.
- `PATCH` protected commercial fields on locked orders — blocked (change-request flow).
- `POST /orders/ai/*` — extract, planning, suggestion batches.
- **Must not break:** `pipeline_status` / milestone fields; `commercial_snapshot_json` semantics (frozen at conversion).

## Change requests

- `POST /change-requests`, `GET /change-requests/pending-summary`, `GET /change-requests/{id}`.
- `GET /orders/{id}/change-requests`, `GET /quotations/{id}/change-requests`.
- `POST /change-requests/{id}/approve|reject|apply|cancel`.
- `GET /orders/{order_id}/commercial-timeline`, `GET /quotations/{quotation_id}/commercial-timeline` — read-only commercial change-control audit timeline (tenant-scoped).
- **Must not break:** 403 tenant mismatch; capability checks; response models for `CommercialChangeRequestOut`.

## Merch router (`/merch/*`)

- Styles, BOMs, consumption, follow-ups, pipeline, wastage, alerts — all under `/merch/...`.
- `GET /merch/control-tower/summary` — aggregated merchandising dashboard counts (tenant-scoped); additive endpoint for **Merch control tower** UI.
- `GET /merch/reports/catalog` — static list of merchandising KPI/report **API paths** and matching **in-app routes** (`tenant_id` + `reports[]`); additive for hubs and integrations.
- `GET/POST /merch/samples`, `GET /merch/samples/{id}`, comments — merchandising sample development (tenant-scoped).
- **Tenant:** `db.get` + `entity.tenant_id != tenant.id` → **404** (not 403) for ID enumeration safety.
- **Must not break:** paths like `/merch/boms/{id}`, `/merch/styles/{id}`, `/merch/pipeline`, `/merch/pipeline/full`, `/merch/pipeline/analytics`.

## Order BOMs (`/merch/order-boms/*`)

- `GET /eligible-orders`, `POST /from-order`, `GET /by-order/{order_id}`, `GET /{bom_id}/detail`, workflow posts (submit/approve/freeze), PO helpers.
- **Must not break:** detail JSON shape consumed by BOM UI; permission dependencies on approve/freeze/PO.

## AI apply (suggestion batches)

- Inquiry / quotation / order: `POST .../suggestion-batch/apply-suggestions` (and related) must respect commercial locks and tenant; audit rows written with tenant scope.

## Frontend expectations (high level)

- **Inquiry:** list → create → detail; AI panel optional.
- **Quotation:** workspace uses PATCH + costing line APIs; list shows status/readiness where implemented.
- **Order:** detail shows pipeline + alignment link; create from quotation.
- **BOM:** `BomBuilderPage` + order BOM flows use `/merch/boms/*` and `/merch/order-boms/*`.
- **Reports:** `/app/reports/merchandising` loads tenant overview + **Merch control tower** snapshot + catalog-driven shortcuts to `/app/merchandising/*` operational screens.

---

*Phase 1.5 deliverable; extend as endpoints evolve.*
