# Merchandising Module — Full Audit Report

**System:** P7 ERP (FastAPI + React/Vite)  
**Context:** Garment manufacturing / buying house  
**Audit method:** Static code review (models, routers, services, frontend pages/hooks, API client). No runtime tests executed.  
**Date:** 2026-04-10  

---

# 1. Executive Summary

- **Overall maturity:** **Strong** on the **inquiry → quotation → order** spine, **commercial snapshot + alignment**, **change requests**, **pipeline milestones**, **BOM (style + order-driven)**, and **AI-assisted** inquiry/quotation/order/costing/planning surfaces. **Moderate** on **router modularization** (most domain routers are empty placeholders; legacy `merch/router.py` still carries the load). **Weaker** on **numeric/FX consistency** at the **header document** level (many amounts stored as strings).
- **Already strong:** Tenant-scoped queries on core entities; `commercial_snapshot_json` on orders; `commercial_change_requests` table + REST API; `PIPELINE_STAGES` workflow; rich quotation costing models (`costing.py`) + costing AI endpoints; order AI planning/what-if; order BOM workflow under `/merch/order-boms/*`.
- **Partially implemented:** Merch package split (`routers/styles.py`, `pipeline.py`, `alerts.py`, `tna.py`, `consumption.py`, `wastage.py`, `exports.py` are **stub routers**); style/sample lifecycle fields without a full sample workflow module; unified TNA bridges merch + manufacturing but manufacturing TNA models live separately.
- **Missing / not found:** `POST /api/v1/quotations/ai/extract` (quotation AI router has no extract route); dedicated **tech pack / sample approval** domain beyond style + follow-up; **not verified** in this pass: exhaustive enforcement of `merch.access` submodule matrix on every merch route (requires per-endpoint authz audit).
- **Top risks:** String commercial fields; parallel permission stories (`permissions.py` registry vs `merch.*` JSON); operational confusion between **legacy BOM** (`/merch/boms`) and **order BOM** (`/merch/order-boms`).
- **Top opportunities:** Normalize money/FX; finish router decomposition; deepen one-screen “alignment + exceptions + change requests” UX; tighten automated tests around tenant boundaries for AI audit logs and change-request apply.

---

# 2. Module Scope Identified in Codebase

## 2.1 Merchandising-related frontend pages (internal `/app/*`)

| Area | Primary files |
|------|----------------|
| Inquiries | `frontend/src/pages/app/InquiriesPage.tsx`, `InquiryCreatePage.tsx`, `InquiryDetailPage.tsx`, `frontend/src/pages/print/InquiryPrintPage.tsx` |
| Quotations | `frontend/src/pages/app/QuotationsPage.tsx`, `QuotationDetailPage.tsx`, `frontend/src/features/quotations/workspace/QuotationWorkspacePage.tsx`, `frontend/src/pages/print/QuotationPrintPage.tsx` |
| Orders | `frontend/src/pages/app/OrdersPage.tsx`, `OrderCreatePage.tsx`, `OrderDetailPage.tsx`, `frontend/src/pages/print/OrderPrintPage.tsx` |
| Styles | `frontend/src/pages/app/StylesPage.tsx`, `StyleDetailPage.tsx`, `frontend/src/pages/print/StylePrintPage.tsx` |
| BOM / consumption | `frontend/src/pages/app/BomBuilderPage.tsx`, `ConsumptionPlansPage.tsx`, `ConsumptionReconciliationPage.tsx`, `ConsumptionControlPage.tsx` |
| Merch ops | `MerchPipelinePage.tsx`, `PipelineAnalyticsPage.tsx`, `MerchCriticalAlertsPage.tsx`, `WastageReportPage.tsx`, `FollowupPage.tsx` |
| TNA (manufacturing area) | `frontend/src/pages/app/manufacturing/TnaDashboardPage.tsx`, `TnaTemplatesPage.tsx`, `TnaPlansPage.tsx`, `TnaPlanDetailPage.tsx` |
| Reports | `reports/merchandising` → `ReportsOverviewPage` (`frontend/src/app/AppProtectedRouter.tsx`); `reports/style-360` → `ReportStyle360Page.tsx` |

**Routing source:** `frontend/src/app/AppProtectedRouter.tsx` (paths such as `inquiries`, `quotations`, `orders`, `merchandising/*`, `bom/*`, `tna/*`, `followup`, `reports/merchandising`, `reports/style-360`). **Navigation labels:** `frontend/src/app/sidebarConfig.tsx`.

## 2.2 Merchandising-related API endpoint families

All below assume `settings.api_v1_prefix` = `/api/v1` (see `backend/app/main.py` includes).

| Prefix | Router module | Role |
|--------|----------------|------|
| `/inquiries` | `backend/app/modules/inquiries/router.py` | Inquiry CRUD, pagination, status transitions, related loads |
| `/inquiries/ai/*` | `backend/app/modules/inquiries/inquiry_ai_router.py` | Extract, enrich, validate, dedupe, summary, next-actions, audit, suggestion batches |
| `/quotations` | `backend/app/modules/quotations/router.py` | Quotation CRUD, from-inquiry, costing lines, status |
| `/quotations/ai/*` | `backend/app/modules/quotations/quotation_ai_router.py` | General AI + costing intelligence (completeness, anomaly scan, FX sensitivity, suggestions, benchmark, costing audit) |
| `/orders` | `backend/app/modules/orders/router.py` | Orders, from-quotation, pipeline, promise/planning-related endpoints, materials, commercial alignment |
| `/orders/ai/*` | `backend/app/modules/orders/order_ai_router.py` | Extract, execution/planning AI, what-if, audit logs |
| `/change-requests` + nested | `backend/app/modules/orders/change_request_router.py` | Commercial change requests (create, list, approve, reject, apply, pending summary) |
| `/merch/*` | `backend/app/modules/merch/router.py` (legacy) | Styles, BOMs, consumption, followups, pipeline, wastage, alerts, etc. |
| `/merch/order-boms/*` | `backend/app/modules/merch/routers/boms.py` | Order-scoped BOM workflow |
| `/costing/*` | `backend/app/modules/costing/router.py` | Item categories, units, items, currencies (masters for quotation forms) |
| `/tna-unified/*` | `backend/app/modules/tna_unified/router.py` | Unified actions/summary + AI follow-up insights |
| `/ai-extract/*` | `backend/app/modules/ai_extract/router.py` | Stateless customer/inquiry form extraction (also used by module-specific extract) |
| `/production/*` | `backend/app/modules/production/*` | Readiness, planning board, Gemini planning (downstream of orders) |
| `/inventory/*` | `backend/app/modules/inventory/router.py` | Material readiness per order (ties to production readiness) |
| `/dashboard/*` | `backend/app/modules/dashboard/router.py` | AI profitability brief (mentions quotation/trade context in codebase map) |

**Mount evidence:** `backend/app/main.py` includes `inquiries_router`, `quotations_router`, `orders_router`, `merch_router` with `prefix=settings.api_v1_prefix`.

## 2.3 Database entities / models / tables (merchandising core)

**Primary:** `backend/app/models/merch.py`

- `Inquiry`, `InquiryItem`, `InquiryEvent`
- `Quotation`, `Order` (merch sales order)
- `GarmentStyle`, `StyleComponent`, `StyleColorway`, `StyleSizeScale` (continued in same file)
- `Bom`, `BomItem`
- `ConsumptionPlan`, `ConsumptionPlanItem`
- `Followup` (`order_followups`), `FollowupActionTemplate`, `OrderFollowupAction`, `FollowupActionComment`, `FollowupActionRejectionLog`
- `OrderAmendment` (in file; used for order change history)

**Costing / quotation lines:** `backend/app/models/costing.py` — `Item`, `ItemCategory`, `ItemSubcategory`, `ItemUnit`, `Currency`, `CurrencyExchangeRate`, `QuotationMaterial`, `QuotationManufacturing`, `QuotationOtherCost`, `QuotationSizeRatio`, etc.

**Commercial governance:** `backend/app/models/commercial_change_request.py` — `CommercialChangeRequest`

**AI batches (examples):** `InquiryAiSuggestionBatch` / items under `backend/app/models/inquiry_ai_suggestion.py` (referenced from inquiry AI batches); analogous patterns for quotation/order AI (files present under `modules/quotations` and `modules/orders`).

**Alerts:** `backend/app/models/alert.py` (definitions/instances — used by merch alert engine).

**Manufacturing TNA:** `backend/app/models/manufacturing.py` — separate from merch follow-up but unified via `tna_unified`.

## 2.4 Frontend hooks / services / utilities

| File | Export / purpose |
|------|------------------|
| `frontend/src/hooks/useInquiryAi.ts` | Inquiry AI API orchestration |
| `frontend/src/hooks/useQuotationAi.ts` | Quotation AI |
| `frontend/src/hooks/useQuotationCostingSuggestions.ts` | Costing suggestions |
| `frontend/src/hooks/useQuotationCostBenchmark.ts` | Benchmark |
| `frontend/src/hooks/useOrderAi.ts` | Order AI + extract merge patterns |
| `frontend/src/hooks/useDocumentExtraction.ts` | `/ai-extract/*` (generic; inquiry flow also uses module extract) |
| `frontend/src/features/merch/workflow.ts` | Shared merch workflow helpers |
| `frontend/src/features/quotations/workspace/useQuotationWorkspaceController.ts` | Quotation workspace state |
| `frontend/src/components/merch/bom/useBomPage.ts` | BOM page logic |

**API surface:** `frontend/src/api/client.ts` — methods for `/inquiries`, `/quotations`, `/orders`, `/merch`, `/merch/order-boms`, change-requests, AI endpoints, `getOrderCommercialAlignment`, `from-quotation`, `from-inquiry`, etc.

## 2.5 Permissions / roles / workflow controls

1. **Module registry (Settings → Roles UI data):** `backend/app/common/permissions.py` — `merch` module with `merch.access` and submodules: inquiries, quotations, orders, PI, styles/BOM, customers.
2. **Fine-grained merch JSON keys:** `backend/app/modules/merch/permissions.py` — `merch.style.manage`, `merch.bom.approve`, `merch.bom.freeze`, `merch.po.generate`, `merch.alert.scan`, `merch.alert.assign`, `merch.tna.manage`, `merch.wastage.manage`, `merch.alert.definitions`; wildcards `merch.*` / `*`; **missing key ⇒ allowed**, explicit `false` denies.
3. **Commercial change requests:** `backend/app/modules/orders/commercial_change_authz.py` — capabilities such as `propose_change`, `view_changes`, `approve_change`, `reject_change`, `apply_change` (invoked from `change_request_router.py`).
4. **Inquiry / quotation / order AI:** separate authz modules (`inquiry_ai_authz.py`, etc.) with capability checks per endpoint.
5. **Workflow transition validation:** `backend/app/common/workflow.py` — `INQUIRY_TRANSITIONS`, `QUOTATION_TRANSITIONS`, `ORDER_TRANSITIONS`, `BOM_TRANSITIONS`, `PIPELINE_STAGES`.

---

# 3. End-to-End Workflow Mapping (as implemented)

## 3.1 Inquiry → Quotation

| Step | Screen | API | DB | Business event | Downstream |
|------|--------|-----|-----|----------------|------------|
| Create/edit inquiry | `InquiryCreatePage` | `POST/PATCH /inquiries` | `inquiries`, `inquiry_items` | Status usually `DRAFT` → workflow | Optional `GarmentStyle` link |
| AI extract / enrich | `InquiryCreatePage`, `InquiryAiPanel` | `POST /inquiries/ai/extract`, enrich/validate/... | AI batch tables + audit | Suggestions, not always auto-apply | User apply via batch flows |
| Submit / convert inquiry | Inquiry detail / API | Status transitions per `INQUIRY_TRANSITIONS` | `inquiries.status` | `SUBMITTED`, later `CONVERTED` | May block duplicate sloppy data (AI dedupe assists) |
| Create quotation from inquiry | Quotation workspace | `POST /quotations/from-inquiry/{id}` (client.ts) | `quotations` + costing lines | New quotation linked `inquiry_id` | Costing lines in `quotation_*` tables |

## 3.2 Quotation → Order

| Step | Screen | API | DB | Business event | Downstream |
|------|--------|-----|-----|----------------|------------|
| Costing entry | `QuotationWorkspacePage` | `PUT/PATCH /quotations`, costing line endpoints | `quotations`, `quotation_materials`, etc. | Totals/margins | Header strings + line numerics (mixed model) |
| Quotation AI / costing intelligence | `QuotationAiPanel`, costing panel | `/quotations/ai/*` | AI audit + suggestions | Advisory + optional apply paths | Must respect locks (see §8) |
| Approve / send / convert | Quotations UI | Status via `QUOTATION_TRANSITIONS` | `quotations.status` | Locks commercial fields when `APPROVED`/`SENT`/`CONVERTED` | Change requests for protected fields |
| Create order | `OrderCreatePage` | `POST /orders/from-quotation/{id}` | `orders`, links `quotation_id` | Snapshot captured | `commercial_snapshot_json` populated in service layer at conversion (see `commercial_snapshot_service.py`) |

## 3.3 Order → downstream (commercial, BOM, production)

| Step | Screen | API | DB | Business event | Downstream |
|------|--------|-----|-----|----------------|------------|
| Pipeline milestones | `OrderDetailPage`, pipeline views | `PATCH` status/pipeline endpoints, `pipeline_service` | `orders.pipeline_status`, milestone timestamps | Auto-advance stages | Drives merch pipeline UI + financier visibility |
| Commercial alignment check | Order detail | `GET /orders/{id}/commercial-alignment` | Compare `commercial_snapshot_json` vs live quotation | Read-only discrepancies | Supports audit and merchandiser review |
| Change requests | Order/quotation UI (where wired) | `/change-requests`, nested lists | `commercial_change_requests` | `pending_approval` → approve → apply | Mutates entity after approval |
| BOM from order | BOM builder / order BOM UI | `/merch/order-boms/from-order`, workflow posts | `boms`, `bom_items` | submit → approve → freeze | PO generation hooks, `auto_advance_order_pipeline` in boms router |
| Consumption planning | `ConsumptionPlansPage` | `/merch/consumption-plans` | `consumption_plans` | Planned requirements | Inventory/procurement signals (integration depth varies) |
| TNA / follow-up | `FollowupPage`, TNA pages | `/merch/followup-actions`, `/tna-unified/*`, manufacturing TNA | `order_followup_actions`, mfg TNA tables | Task tracking | Customer/milestone discipline |

## 3.4 Commercial lock + change request flow

- **Locks defined in code:** `backend/app/modules/orders/commercial_fields.py` — `ORDER_COMMERCIAL_LOCKED_STATUSES`, `QUOTATION_COMMERCIAL_LOCKED_STATUSES`, protected field sets.
- **API:** `backend/app/modules/orders/change_request_router.py` — REST under `/api/v1` (no extra prefix on router).
- **Order AI blocked fields:** `backend/app/modules/orders/order_ai_batches.py` references `is_order_commercial_locked` and `ORDER_PROTECTED_COMMERCIAL_FIELDS` when applying AI suggestions.

## 3.5 Gaps in workflow continuity

- **Quotation:** no `/quotations/ai/extract` in `quotation_ai_router.py` — document-led quotation entry is weaker than inquiry/order.
- **Router decomposition:** domain merch routers are mostly empty; **single large legacy file** increases risk of inconsistent patterns.
- **Garment-specific sample loop:** not modeled as its own workflow entity (style master + orders/TNA carry part of the burden).

---

# 4. Database & Data Model Assessment

## 4.1 Tables/models found (summary)

- **Merch core:** see §2.3 (`merch.py`).
- **Costing lines:** `costing.py` links quotation lines to inventory `items` and supports size ratios.
- **Commercial change:** `commercial_change_requests` with `tenant_id`, `entity_type`, `entity_id`, `field_key`, values as text, status, proposal/review/apply audit ids, `meta_json`.

## 4.2 Key fields & relations

- **Tenant:** `tenant_id` on `Inquiry`, `InquiryItem`, `Quotation`, `Order`, `GarmentStyle`, `Bom`, `BomItem`, consumption, follow-ups, change requests, exchange rates, items/categories (not global `Currency` table).
- **Customer:** `customer_id` on inquiry/quotation/order; style may reference `buyer_customer_id`.
- **Style:** optional `style_id` on inquiry/quotation/order; `Bom.style_id` required; `Bom.order_id` optional for order-driven BOMs.
- **Quotation ↔ Order:** `orders.quotation_id`; **`commercial_snapshot_json`** on order documents frozen commercial header at conversion (comment in model: not auto-synced).
- **Pipeline:** `orders.pipeline_status` default `ORDER_CONFIRMED`; milestone timestamp columns (`pi_issued_at`, `lc_received_at`, `bom_created_at`, …).
- **BOM linkage to costing:** `bom_items.quotation_line_id` → `quotation_materials.id`.

## 4.3 Status & workflow fields

- **Inquiry/quotation/order `status`:** string enums validated by `workflow.py` transitions in routers.
- **BOM `status`:** DRAFT → SUBMITTED → APPROVED → FROZEN (see `BOM_TRANSITIONS`).
- **Pipeline:** separate from legacy order `status`; comments in `workflow.py` clarify lifecycle.

## 4.4 Audit fields

- **Standard:** `created_at`, `updated_at` on most entities.
- **BOM workflow:** `submitted_by/at`, `approved_by/at`, `frozen_by/at`, rejection columns.
- **Change requests:** full proposal/review/apply audit trail.
- **AI:** `AiAuditLog` pattern with `prompt_category` (e.g. `inquiry_ai`) — tenant filtering implemented in service functions (verify each list endpoint).

## 4.5 AI-related fields

- Suggestion batches and items (per module) store structured JSON for proposed changes; **not fully enumerated here** — see `inquiry_ai_batches.py` / quotation/order counterparts.

## 4.6 Constraints & normalization issues

- **Monetary headers as strings:** `Inquiry.target_price`, `Quotation.material_cost`, `quoted_price`, `Order` does not duplicate all commercial fields on header — snapshot held in JSON. This is **garment-ERP workable** but **weak for aggregation, strict FX conversion, and DB-level constraints**.
- **`Currency` master:** global (no `tenant_id`); **rates** are per-tenant in `CurrencyExchangeRate` — consistent with shared ISO codes + tenant-specific rates.
- **Unique codes:** items/categories enforce tenant+code uniqueness in `costing.py`.

## 4.7 Garment fit

- **Strong:** style master with season/department/fabric/gsm/fit/wash; size scales/colorways/components; quotation size ratios; BOM with wastage and variance fields; TNA-style follow-up; pipeline export steps (LC, etc.).
- **Partial:** sample development is **not** a dedicated subledger; relies on style + orders + tasks.
- **Missing:** graded spec revision control, lab dip approvals, digital tech pack versioning — **not found** as first-class modules in this audit pass.

---

# 5. Tenant Isolation & Security Review

## 5.1 Backend enforcement pattern

- **Standard:** `require_tenant` + `get_current_user`; checks `user.tenant_id == tenant.id` on sensitive routers (example: `change_request_router.py`).
- **Data access:** queries filter `Model.tenant_id == tenant.id` (verified pattern in `inquiries/router.py` via grep on `Inquiry.tenant_id`).
- **Related entities:** joins assert customer/style belong to tenant (e.g. inquiry create validates `customer.tenant_id`, `GarmentStyle.tenant_id`).

## 5.2 Merchandising data

- Core merch tables include **`tenant_id`** with FK to `tenants` and cascade rules on delete — **good row-level separation at schema level**.
- **Risk:** any raw-SQL or future reporting endpoint that omits `tenant_id` filter would leak data — **mitigation is application-level** (no RLS verified in this audit).

## 5.3 AI audit / history

- Inquiry AI audit listing filters by `prompt_category` and `tenant_id` in service code path (`inquiry_ai_service.list_inquiry_ai_audit_logs` — pattern referenced in subagent output). **Same discipline should be verified** for quotation/order AI audit endpoints before production sign-off.

## 5.4 Change requests

- **Tenant:** `CommercialChangeRequest.tenant_id` + service/repo filters; router passes `tenant.id` into service layer.
- **Entity ownership:** list-by-order verifies `Order.tenant_id` before listing CRs.

## 5.5 Permission boundaries

- **Merch JSON permissions** apply to BOM/alert/TNA/wastage style operations using `require_merch_permission`.
- **Submodule `merch.access` matrix:** enforcement depends on shared authz helpers used by each router — **not exhaustively verified** in this document.

## 5.6 Leakage risks

- **ID enumeration:** if any endpoint used `db.get(Model, id)` without tenant check, it would be critical — spot checks show tenant checks on change requests and inquiries; **full OpenAPI scan recommended** as a follow-up task.
- **Implicit vs explicit:** most protection is **explicit in Python routers**, not database RLS.

---

# 6. Frontend UI / UX Assessment

## 6.1 Components / areas

- **Inquiry:** list, create, detail, print; `InquiryAiPanel` for AI.
- **Quotation:** list with readiness/anomaly badges (`QuotationsPage.tsx`); large workspace (`QuotationWorkspacePage`) with sidebar and costing intelligence panel.
- **Order:** list, create, detail, print; `OrderAiPanel`, `PlanningGroundingCard` (from exploration).
- **Merch ops:** pipeline, analytics, alerts, wastage, follow-up; BOM builder; consumption pages.
- **TNA:** manufacturing section pages + `FollowupPage` as unified entry per sidebar.

## 6.2 Strengths

- **Enterprise-style** separation of list vs detail vs print views.
- **AI visible** on inquiry, quotation, order surfaces (panels + hooks).
- **Commercial alignment** API consumed from client (`getOrderCommercialAlignment`) — surfacing quality depends on `OrderDetailPage` implementation (not line-read in this audit).

## 6.3 Weaknesses / fragmentation

- **Multiple navigation homes** for “merch” (CRM paths vs `merchandising/*` vs `bom/*` vs `tna/*`) — cognitively heavy for beginners unless guided.
- **No single “Merch command center” page** in code (pipeline is close but not full chain).
- **Responsiveness:** project has inventory mobile patterns; merch tables may still be wide — verify key list pages on narrow screens.

## 6.4 Merchandiser speed

- **Fast:** quotation workspace + AI costing + order BOM flow when trained.
- **Friction:** stringly-typed header fields in UI can allow bad input unless masked/validated client-side.

---

# 7. AI Integration Assessment

## 7.1 Inquiry AI

| Aspect | Detail |
|--------|--------|
| Purpose | Extract, enrich, validate, dedupe, summary, next actions, suggestion apply |
| UI trigger | `InquiryAiPanel`, create/detail pages |
| API | `/api/v1/inquiries/ai/*` (`inquiry_ai_router.py`) |
| Data reads | Inquiry records, related customer/style context (service-dependent) |
| Writes | Through controlled suggestion batch apply / finalize flows |
| Advisory | Summary, next-actions, many validate flags |
| Locks | Must align with inquiry status and tenant AI authz |
| Audit | GET `/inquiries/ai/audit-log` |
| Maturity | **High** — full batch lifecycle |

## 7.2 Quotation AI + costing intelligence

| Aspect | Detail |
|--------|--------|
| Purpose | General AI + **rule-heavy** costing completeness/anomaly, margin/FX narratives, suggestions, benchmark |
| UI | `QuotationAiPanel`, `QuotationCostingIntelligencePanel` |
| API | `/api/v1/quotations/ai/*` (`quotation_ai_router.py`) |
| LLM vs rules | Costing anomaly path described as **deterministic rules** in exploration; narratives may use LLM where configured |
| Extract | **Not found** on quotation AI router |
| Audit | `/costing-audit-log`, general `/audit-log` |

## 7.3 Order AI + planning

| Aspect | Detail |
|--------|--------|
| Purpose | Extract, execution validation, planning risk, ATP/CTP summary, what-if, promise sensitivity, capacity scan |
| API | `/api/v1/orders/ai/*` |
| Planning grounding | `GET /orders/{id}/planning-grounding`, summary endpoints — ties to `planning_grounding_service.py` + production readiness |
| Audit | `/audit-log`, `/planning-audit-log`, `/simulation-audit-log` |

## 7.4 Document extraction

| Path | Detail |
|------|--------|
| Generic | `POST /api/v1/ai-extract/customer-form`, `inquiry-form` |
| Inquiry | `POST /api/v1/inquiries/ai/extract` |
| Order | `POST /api/v1/orders/ai/extract` |
| Quotation | **Not found** |

## 7.5 Cross-cutting AI

- **`/api/v1/ai-tool/*`:** tenant anomaly insights (may reference orders, inventory, etc.).
- **Production Gemini:** planning suggestions — downstream of merchandising handoff.
- **Dashboard:** AI profitability — margin signals with narrative.

## 7.6 Missing merchandising AI capabilities

- Quotation PDF/tech-pack extract-to-costing-sheet.
- **Style/BOM** AI assist (not surfaced in hooks list as `useStyleAi` — **not found**).
- **Automated LC/shipping term compliance** check tied to master contract — partial elsewhere (commercial module); not fully traced here.

---

# 8. Business Reasoning & Business Rules Assessment

## 8.1 Status logic

- Central definitions: `backend/app/common/workflow.py` — transition graphs for inquiry, quotation, order (legacy), BOM; pipeline stage ordering for execution.

## 8.2 Commercial locking

- `commercial_fields.py` — when order status in `{CONFIRMED, IN_PROGRESS, COMPLETED}`, protected fields cannot be PATCHed directly; quotation locked when `APPROVED|SENT|CONVERTED`.

## 8.3 Quotation / order alignment

- `commercial_snapshot_service.py` — builds snapshot at conversion; `list_commercial_discrepancies` compares frozen JSON vs live quotation; **read-only** (explicit in module docstring).

## 8.4 Change request logic

- Router enforces `require_commercial_capability` per action; service layer applies approved changes (not fully expanded in this read).

## 8.5 Currency / FX

- Tenant exchange rates in `CurrencyExchangeRate`; header `exchange_rate` often string on documents; quotation AI exposes **FX sensitivity** endpoints — good advisory layer; **canonical conversion** should be traced in `quotation_commercial_money.py` for correctness (file name from exploration).

## 8.6 Planning / promise / readiness

- `promise_checks.py`, `planning_grounding_service.py`, `production/readiness_service.py` — chain readiness for manufacturing handoff.

## 8.7 Garment workflow fit

- **Correct:** separation of pipeline vs document status; commercial governance; BOM linkage to quotation materials.
- **Incomplete:** sample/techpack lifecycle; multi-version quotation revision governance beyond `version_no` field (business rules for versioning not fully audited here).

---

# 9. Cross-Module Relationship Map

| Related module | Data dependency | Workflow dependency | Risk if missing | Status |
|----------------|-----------------|---------------------|-----------------|--------|
| Customers | `customer_id` on I/Q/O | Inquiry/quote must validate customer tenant | Wrong buyer on contract | **Implemented** |
| Inventory / items | `items`, warehouses on BOM | Procurement, GRN | Cannot tie cost to stock | **Implemented** (depth varies) |
| Production / planning | Order id, readiness APIs | Pipeline stages, planning boards | Schedule slip | **Implemented** |
| BOM | `boms`, `bom_items`, order BOM | Material issue, PO | Cost/availability drift | **Strong** |
| Commercial / LC | `master_contract_id`, milestones | Export pipeline | Compliance gaps | **Partial** (more in commercial module) |
| Finance | Invoices/payments (not deep-audited here) | Revenue recognition | Margin vs books mismatch | **Unknown** in this pass |
| Reporting | Report routes, pipeline analytics | Management KPIs | Blind spots | **Partial** |
| Audit | AI audit logs, change requests | Forensics | Disputes | **Good** on CR + AI patterns |
| Settings | Roles, feature flags | Module visibility | Wrong access | **Partial** verification |
| AI framework | ai_tool, gemini clients | Advisory | Cost/overtrust | **Implemented** |

---

# 10. Code Quality & Architectural Findings

- **Separation of concerns:** Good at **service** level (BOM workflow, snapshot, change requests, costing intelligence); **weaker** at **HTTP layer** for merch (monolithic `merch/router.py` + empty domain routers).
- **Frontend/backend alignment:** DTOs and client methods generally exist for major flows; **risk** when new fields added only to backend.
- **Naming:** `Order` in merch means **sales order** — clear in context but overlaps with purchase/manufacturing “order” language in UI; discipline required in docs.
- **Status consistency:** Three parallel concepts — `status`, `pipeline_status`, BOM `status` — **powerful but requires training**.
- **Extensibility:** JSON snapshots and `meta_json` on change requests aid evolution; also risk of **schema drift**.
- **Technical debt:** placeholder routers; string money headers; permission dual tracks.

---

# 11. Gap Analysis

| Area | Current State | Gap / Problem |
|------|---------------|---------------|
| Workflow | I→Q→O + pipeline + CR + BOM | Quotation extract; sample/techpack lifecycle weak |
| Database | Rich relations + tenant_id | Header money as strings; limited DB-level numeric integrity |
| Approvals | Quotation transitions + CR for locked fields | Not all commercial edits may route through CR if endpoints bypass checks |
| Tenant isolation | App-layer filters + tenant_id columns | No RLS verified; must audit every new endpoint |
| AI | Broad coverage | Quotation extract missing; style/BOM AI not surfaced |
| UI | Strong pages | Fragmented navigation; beginner overload |
| Costing | Detailed line models + AI | Header vs line consistency burden |
| BOM linkage | Quotation line FK + order BOM | Two BOM paradigms to explain |
| Planning linkage | Readiness + order AI | Full ATP/CTP operational closure needs validation |
| Reporting | Pipeline analytics, wastage, reports routes | Executive merch KPI dashboard not a single module |
| Auditability | CR + AI logs | Need unified “commercial event stream” UX |
| Customer collaboration | Portals + CRM | Internal merch collaboration limited |
| Document intelligence | Inquiry/order extract | Quotation-side gap |
| FX / currency | Rates table + AI sensitivity | String header rates; single numéraire story must stay documented |

---

# 12. Improvement Recommendations

## Critical

1. **Audit every merch-related endpoint** for `tenant_id` scoping (automated test matrix).
2. **Plan numeric normalization** for commercial headers or enforce strict server-side parse/validate with canonical storage.
3. **Document and test** commercial lock + CR + AI apply interaction (regression suite).

## High priority

1. **Split `merch/router.py`** into real domain routers; delete redundancy once parity tests pass.
2. **Quotation document extract** parity with inquiry/order (if business requires PDF/Excel intake).
3. **Unified permission story** — map `merch.access` submodules to concrete FastAPI dependencies per route.

## Medium priority

1. **Merch dashboard** combining pipeline exceptions, open change requests, costing anomaly counts, overdue TNA.
2. **Sample/techpack** submodule design (even minimal: statuses + attachments + approvals).
3. **Mobile-friendly** wide tables on inquiry/quotation/order lists.

## Nice to have

1. **Style AI** assistant (spec completeness, risk of missing trims).
2. **Customer-visible** milestone sync (portal) tied to `pipeline_status`.
3. **Benchmark** expansion across seasons/categories with more reference data.

---

# 13. Suggested Future Build Sequence

- **Phase 1 — Stabilize:** Tenant/CR/lock regression tests; document BOM paths; training materials for pipeline vs status.
- **Phase 2 — Data/workflow integrity:** Money normalization plan; quotation versioning rules; optional RLS spike on Postgres.
- **Phase 3 — Commercial controls & reporting:** Merch exec dashboard; CR inbox; alignment widgets on every order from quotation.
- **Phase 4 — AI & planning:** Quotation extract; deeper readiness→planning automation with human gates.
- **Phase 5 — Customer & analytics:** Portal parity with internal milestones; margin analytics by style/category.

---

# 14. Appendix

## 14.1 Discovered file list (representative)

**Backend merch package:**  
`backend/app/modules/merch/router.py`, `schemas.py`, `deps.py`, `constants.py`, `permissions.py`, `alert_engine.py`, `alert_rules.py`, `bom_*.py`, `webhooks.py`, `plm_stubs.py`, `routers/__init__.py`, `routers/boms.py`, `routers/*.py` (placeholders), …

**Backend adjacent:**  
`backend/app/modules/inquiries/*`, `backend/app/modules/quotations/*`, `backend/app/modules/orders/*`, `backend/app/modules/costing/router.py`, `backend/app/modules/tna_unified/router.py`, `backend/app/modules/ai_extract/router.py`, `backend/app/common/workflow.py`, `backend/app/models/merch.py`, `backend/app/models/costing.py`, `backend/app/models/commercial_change_request.py`

**Frontend:**  
Pages under `frontend/src/pages/app/*` listed in §2.1; components `frontend/src/components/inquiries/`, `quotations/`, `orders/`, `merch/`, `ai-extract/`; hooks in §2.4; `frontend/src/api/client.ts`.

## 14.2 Discovered route list (frontend, under `/app/`)

`inquiries`, `inquiries/new`, `inquiries/:id`, `inquiries/:id/edit`, `inquiries/:id/print`, `quotations`, `quotations/new`, `quotations/:id`, `quotations/:id/print`, `orders`, `orders/new`, `orders/:id`, `orders/:id/print`, `merchandising/styles`, `merchandising/styles/:id`, `merchandising/styles/:id/print`, `bom`, `bom/orders`, `merchandising/pipeline`, `merchandising/pipeline-analytics`, `merchandising/alerts`, `merchandising/wastage-report`, `merchandising/consumption-reconciliation`, `tna/dashboard`, `tna/templates`, `tna/plans`, `tna/plans/:planId`, `followup`, `time-action`, `reports/merchandising` (`ReportsOverviewPage`), `reports/style-360` (`ReportStyle360Page`) — **source:** `frontend/src/app/AppProtectedRouter.tsx`.

## 14.3 Discovered API list (summary groups)

- `/api/v1/inquiries` + `/api/v1/inquiries/ai/*`
- `/api/v1/quotations` + `/api/v1/quotations/ai/*`
- `/api/v1/orders` + `/api/v1/orders/ai/*` + planning-grounding paths on orders router
- `/api/v1/change-requests` + `/api/v1/orders/{id}/change-requests` + `/api/v1/quotations/{id}/change-requests`
- `/api/v1/merch/*` (legacy router — large surface)
- `/api/v1/merch/order-boms/*`
- `/api/v1/costing/*`, `/api/v1/tna-unified/*`, `/api/v1/ai-extract/*`
- Production/inventory readiness endpoints as linked from orders

## 14.4 Discovered database entity list (merchandising-centric)

`inquiries`, `inquiry_items`, `inquiry_events`, `quotations`, `orders`, `garment_styles`, `style_*` dimensions, `boms`, `bom_items`, `consumption_plans`, `consumption_plan_items`, `order_followups`, `followup_action_templates`, `order_followup_actions`, `followup_action_comments`, `followup_action_rejection_logs`, `order_amendments`, `quotation_materials`, `quotation_manufacturing`, `quotation_other_costs`, `quotation_size_ratios`, `items`, `item_categories`, `item_units`, `currencies`, `currency_exchange_rates`, `commercial_change_requests`, alert tables, AI batch tables (per module).

## 14.5 Discovered AI touchpoints

Inquiry/quotation/order AI routers; costing intelligence endpoints; order planning/what-if; `ai_extract`; `tna_unified` AI; `ai_tool` anomalies; production Gemini planning; dashboard AI profitability.

## 14.6 Assumptions

- `settings.api_v1_prefix` remains `/api/v1`.
- PostgreSQL in production (JSONB on `CommercialChangeRequest`).

## 14.7 Unknowns / not found

- **Exhaustive** list of every `merch.access` check on every route.
- **Finance** posting rules from order shipment/invoice — not traced in this merchandising-focused audit.
- **Explicit** OpenAPI export not generated in this pass.
- **Customer portal** order views: referenced in router exploration but not deep-audited as part of internal merch module.

---

*End of report.*
