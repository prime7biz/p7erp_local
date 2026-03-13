# Merchandising Parity Matrix (PrimeX -> P7)

Goal: implement one-wave merchandising parity using P7 stack (FastAPI + SQLAlchemy + React + TypeScript), based on `replit-legacy/primeX-ERP`.

## 1) Core entity parity

| Domain | PrimeX reference | P7 target |
|---|---|---|
| Customers | `server/api/customerRoutes.ts`, `shared/schema.ts` customers | Existing `customers` module retained; keep tenant-scoped linkage to inquiries/quotations/orders |
| Inquiries | `server/api/inquiryRoutes.ts` + schema inquiry fields (`styleId`, status transitions, trace, AI insights) | Extend `inquiries` model/API with workflow status transition endpoint, style linkage, and optional trace endpoint |
| Quotations | `server/api/quotationRoutes.ts` + quotation/material/manufacturing/other/size-ratio tables | Keep current full update flow; add workflow actions (submit/approve/revise/send), PDF/email hooks as phased stubs |
| Orders | `server/api/orderRoutes.ts` (convert from quotation, status transitions, amendments) | Extend order APIs with conversion behavior and amendment-style history table |
| Styles | `server/routes/merch/merchRoutes.ts`, merchandising service | Add full CRUD for styles plus active toggle and guarded delete |
| BOM | `client/src/pages/merchandising/bom-builder.tsx`, merchandising service | Add BOM and BOM items endpoints/pages with style linkage |
| Consumption | `client/src/pages/merchandising/consumption-plan.tsx` | Add consumption plan and items CRUD with order linkage |
| Follow-up / Alerts | `client/src/pages/followup/index.tsx`, `critical-alerts.tsx` | Add follow-up CRUD API and app page integration |

## 2) Table-level parity checklist

### Already present in P7 (base)
- `inquiries`
- `quotations`
- `orders`
- `garment_styles`
- `boms`
- `bom_items`
- `consumption_plans`
- `consumption_plan_items`
- `order_followups`
- quotation costing children (`quotation_materials`, `quotation_manufacturing`, `quotation_other_costs`, `quotation_size_ratios`)

### Missing/partial for workflow parity (to add)
- `style_components` (style structure)
- `style_colorways` (color variants)
- `style_size_scales` (size mapping)
- `order_amendments` (order revision trail)
- Optional trace table for inquiry workflow steps (`inquiry_events`) if not derivable from existing records

## 3) Workflow parity matrix

| Flow | PrimeX behavior | P7 implementation target |
|---|---|---|
| Inquiry -> Quotation | Conversion endpoint with default pricing/profit policy and status update | Existing conversion retained, plus explicit inquiry status transition to `CONVERTED` |
| Quotation lifecycle | Draft -> Submitted -> Approved -> Sent (+ revise) | Add action endpoints and enforce transition rules in backend |
| Quotation costing | Full payload update with linked rows and recomputed totals | Keep current PUT full update, align field names and recompute rules |
| Quotation -> Order | Conversion endpoint with field carry-forward | Existing conversion retained, add status update on source quotation |
| Order lifecycle | New -> confirmed -> in_progress -> completed (+ amendment audit) | Add amendment records and status transition endpoint |
| Style/BOM linkage | Style central entity linked to inquiry/quotation/order and BOM | Add style API + UI and ensure style_id propagation across docs |

## 4) Calculation parity (must match PrimeX)

### Quotation totals
- `material_cost = sum(material.total_amount)`
- `manufacturing_cost = sum(manufacturing.total_order_cost)`
- `other_cost = sum(other.calculated_amount || other.total_amount)`
- `total_cost = material_cost + manufacturing_cost + other_cost`
- `cost_per_piece = total_cost / projected_quantity` (if qty > 0 else 0)
- `quoted_price` from explicit value; fallback `total_cost * (1 + profit_percentage/100)`

### Currency handling
- Keep quotation line-level currency/exchange rate/base/local fields aligned with current P7 costing implementation.
- Keep tenant currency module as source for pair rates.

## 5) API parity map (target)

### Inquiries
- `GET /api/v1/inquiries`
- `POST /api/v1/inquiries`
- `GET /api/v1/inquiries/{id}`
- `PATCH /api/v1/inquiries/{id}`
- `PATCH /api/v1/inquiries/{id}/status` (new)
- `GET /api/v1/inquiries/{id}/trace` (new, if implemented in wave)

### Quotations
- Existing CRUD + full update
- `POST /api/v1/quotations/from-inquiry/{inquiry_id}` (existing)
- `POST /api/v1/quotations/{id}/submit` (new)
- `POST /api/v1/quotations/{id}/approve` (new)
- `POST /api/v1/quotations/{id}/revise` (new)
- `POST /api/v1/quotations/{id}/send` (new status action)

### Orders
- Existing CRUD + `from-quotation`
- `PATCH /api/v1/orders/{id}/status` (new)
- `GET /api/v1/orders/{id}/amendments` (new)
- `POST /api/v1/orders/{id}/amendments` (new)

### Merchandising linked
- `GET/POST/PATCH/DELETE /api/v1/merch/styles...` (new)
- `GET/POST/PATCH/DELETE /api/v1/merch/boms...` (new)
- `GET/POST/PATCH/DELETE /api/v1/merch/consumption-plans...` (new)
- `GET/POST/PATCH/DELETE /api/v1/merch/followups...` (new)

## 6) Frontend parity map (target pages/actions)

### Existing pages to upgrade
- `frontend/src/pages/app/InquiriesPage.tsx`
- `frontend/src/pages/app/InquiryDetailPage.tsx`
- `frontend/src/pages/app/QuotationsPage.tsx`
- `frontend/src/pages/app/QuotationDetailPage.tsx`
- `frontend/src/pages/app/OrdersPage.tsx`
- `frontend/src/pages/app/OrderDetailPage.tsx`

### New merchandising pages to add
- `frontend/src/pages/app/StylesPage.tsx`
- `frontend/src/pages/app/StyleDetailPage.tsx`
- `frontend/src/pages/app/BomBuilderPage.tsx`
- `frontend/src/pages/app/ConsumptionPlanPage.tsx`
- `frontend/src/pages/app/FollowupPage.tsx`

### Required UI parity actions
- List filters/search/status chips
- Detail-level action buttons (submit/approve/revise/convert)
- Tabbed costing/breakdown blocks
- Inline row add/edit/remove in BOM and costing-related grids
- Workflow status badges and transition controls

## 7) Seed and integration parity data

Must seed linked chain:
- customer -> style -> inquiry -> quotation (+cost rows) -> order -> consumption plan -> followups
- include multi-status records for workflow screens (DRAFT/SUBMITTED/APPROVED/SENT/NEW/IN_PROGRESS/COMPLETED)

## 8) Acceptance for this migration wave

- All merchandising routes in sidebar open functional pages (no dead placeholders for scoped items).
- Full linked flow works end-to-end with one tenant.
- Totals and profitability math match expected values from PrimeX logic.
- Strict tenant isolation preserved for every new/updated query.
