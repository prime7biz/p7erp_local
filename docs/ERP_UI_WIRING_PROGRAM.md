# ERP UI wiring program (operational connection)

## Goal

One connected product: list/detail pages use consistent headers, cross-module links are visible, and copy states that data is **backend-driven** (no fake KPIs).

## Shared components

| Component | Path | Use |
|-----------|------|-----|
| `AppPageHeader` | `frontend/src/components/app/AppPageHeader.tsx` | Title, description, optional back link, actions slot, optional `belowTitle` |
| `WorkflowSummaryStrip` | `frontend/src/components/app/WorkflowSummaryStrip.tsx` | Pipeline chips with optional `to` links |
| `LinkedRecordsSection` | `frontend/src/components/app/LinkedRecordsSection.tsx` | Columns of links (customer detail) |

Barrel: `frontend/src/components/app/index.ts`.

## Modules touched (this pass)

- **Customer:** `CustomersPage`, `CustomerDetailPage` — workflow strip, linked records, tests in `tests/test_customer_module_wiring_integration.py`, doc `docs/CUSTOMER_MODULE_UI.md`.
- **Vendor:** `VendorsPage` — link to purchase orders.
- **Inquiry:** `InquiriesPage` — unified header + filter bar.
- **Quotation:** `QuotationsPage`, `QuotationWorkspacePage` — `AppPageHeader` + `WorkflowSummaryStrip` + `LinkedRecordsSection`, Send + SENT-gated Create Order, Buyer vs Internal print, read-only wiring context (`GET /quotations/{id}/wiring-context`), platform search/AI/QR/portal (flag-gated). Tests: `tests/test_quotation_wiring_context.py`, `tests/test_quotation_platform_wiring.py`.
- **Order:** `OrdersPage`, `OrderDetailPage` — header + workflow strip + planning link.
- **Planning:** `ProductionPlanningPage` — advisory copy in description.
- **Procurement / inventory:** `PurchaseOrdersPage`, `GoodsReceivingPage`, `InventoryItemsPage` — cross-links.

## AI / governance surfaces

- Phases 14–20 operational JSON and governance UI live on **Dashboard** via `ErpAiPhasesDashboardSection` (`frontend/src/components/erp-ai/ErpAiPhasesDashboardSection.tsx`), next to the legacy Gemini brief.

## Validation

```bash
cd frontend && npm run lint
docker compose exec backend pytest tests/test_customer_module_wiring_integration.py -q
```

## Follow-ups (not exhaustive)

- Migrate remaining list pages to `AppPageHeader` + shared table shell.
- React Query adoption for inquiries/quotations/orders (parity with customers).
- Customer 360 hub (2026-11-23): nullable `customer_id` on MSC / PI / Export Case / Delivery Challan / `OutstandingBill`; tabbed detail via `GET /customers/{id}/360` + `/timeline`. See `docs/CUSTOMER_MODULE_UI.md`.
