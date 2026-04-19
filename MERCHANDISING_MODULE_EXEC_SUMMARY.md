# Merchandising Module — Executive Summary

**Audience:** Leadership and product owners  
**Scope:** Codebase audit of merchandising-related flows (inquiry → quotation → order → style/BOM/TNA/commercial), as implemented in P7 ERP.  
**Date:** 2026-04-10  

## Overall maturity

**Mid-to-high for core CRM-style merchandising (inquiry/quotation/order + pipeline + rich AI surfaces),** with **strong backend depth** on BOM workflow, commercial governance, and costing intelligence. **Data model maturity is mixed:** relational links and tenant scoping are solid, but **many monetary fields remain string-typed** on headers, which limits validation, FX math consistency, and reporting precision unless downstream code compensates.

## Strengths

- End-to-end **document chain** with explicit APIs: inquiry, quotation (`from-inquiry`), order (`from-quotation`), plus **frozen commercial snapshot** on orders and **read-only alignment** vs live quotation.
- **Commercial change requests** with tenant-scoped storage, role capability checks, and integration with **commercial lock** rules for orders and quotations.
- **Execution pipeline** (`pipeline_status` + `PIPELINE_STAGES`) ties merchandising to PI/LC/BOM/PO/production/shipment milestones.
- **Merchandising operations pack:** styles, legacy BOMs, **order-driven BOMs** (`/merch/order-boms/*`), consumption plans, follow-ups/TNA actions, pipeline list + analytics, wastage reporting, alert definitions/scanning.
- **AI coverage** is unusually broad: inquiry/quotation/order panels, costing anomaly/completeness/suggestions/benchmarks, planning-risk/what-if on orders, document extract for inquiry/order, unified TNA AI insights.

## Partially implemented

- **Header money normalization:** Phases 3B/3C migrated many merchandising-related numerics; a few edge surfaces may still mix string headers with `Decimal` costing lines — keep regression tests when touching commercial JSON.
- **Settings RBAC registry** lists merch submodules (`merch.access`, inquiries/quotations/orders/PI/styles); **fine-grained enforcement** for those submodule keys vs the separate **`merch.*` JSON keys** should be verified route-by-route (two parallel permission stories).

## Recently closed (rebuild program)

- **Merch router split** — domain routers under `backend/app/modules/merch/routers/` compose the live `/merch/*` API; legacy `merch/router.py` is a thin re-export.
- **Commercial timeline** — `GET /orders/{id}/commercial-timeline` and `GET /quotations/{id}/commercial-timeline` for audit visibility on order and quotation workspaces.
- **Sample development MVP** — `merch_sample_requests` / comments, `/merch/samples*`, UI under `/app/merchandising/samples`.
- **BOM authority / pipeline** — order pipeline BOM milestone aligns with **approved/frozen** non-legacy order BOMs; UI copy distinguishes style vs order BOM.
- **Reporting hub** — `GET /merch/reports/catalog`, richer **Reports** merchandising overview + hub tiles linking into `/app/merchandising/*`.

## Missing or weak

- **Unified merchandising “workbench”** in the UI: strong individual pages, but cross-screen continuity (e.g. one guided path from inquiry to shipped) is **not a single orchestrated module** in code.
- **Customer collaboration** is primarily via **external portals** and CRM; internal merch screens are not a full collaborative workspace.
- **Full tech-pack** document management (beyond samples MVP + style master) can still deepen.

## Top risks

1. **String-typed commercial fields** on inquiry/quotation/order headers complicate FX, margin, and audit consistency.
2. **Dual BOM paths** (style BOM vs order BOM) plus legacy flags — operational confusion if training/docs lag.
3. **Permission model fragmentation** between role submodule matrix and `merch.*` JSON toggles.
4. **AI suggestion apply paths** must stay aligned with **commercial locks** and **tenant isolation** as features grow (regression risk).

## Top opportunities

1. Normalize **money and FX** on headers (or enforce strict parsing layer + DB constraints).
2. Complete **merch router split** from `router.py` into domain routers for maintainability.
3. Productize **alignment + change request** UX on order/quotation screens as the default merchandiser control tower.
4. Deeper **planning ATP/CTP** linkage from order promise checks into production boards (APIs exist; surface consistency can improve).

---

*Full evidence, file lists, and phased roadmap: `MERCHANDISING_MODULE_AUDIT_REPORT.md`.*
