# Inventory Module Advancement Plan

Roadmap to make **Inventory** more capable, user-friendly, robust, and visually consistent with the rest of P7 ERP.

**Scope:** Backend `backend/app/modules/inventory/`, models `backend/app/models/inventory.py`, frontend `frontend/src/pages/app/*` (inventory routes), `frontend/src/app/AppProtectedRouter.tsx`, `frontend/src/app/sidebarConfig.tsx`, `frontend/src/api/client.ts`.

**Status:** In progress — see checklist and implementation log below.

---

## Phase 0 — Navigation honesty (quick wins)

Fix mismatches between the sidebar and real routes so users are not sent to dead or “Coming Soon” flows by surprise.

| # | Task | Notes |
|---|------|--------|
| 0.1 | **Adjustments link** | **Done:** `/inventory/stock-adjustments` and `/new` render `StockAdjustmentsPage`. |
| 0.2 | **Label vs route** | **Done** for Transfers, Adjustments, Stock Dashboard, Valuation (live pages). **Still “Soon”:** Lot Traceability only (badge in sidebar). |
| 0.3 | **Redirects** | `/inventory/units` and `/inventory/warehouses` redirect to Stock Master tab — optional helper text on Stock Master. |
| 0.4 | **Categories / subcategories routes** | **Done:** redirect to `/app/inventory?tab=masters`. |

**Files:** `frontend/src/app/sidebarConfig.tsx`, `frontend/src/app/AppProtectedRouter.tsx`.

---

## Phase 1 — Data integrity & robustness (backend)

| # | Task | Notes |
|---|------|--------|
| 1.1 | **Outbound stock check** | **Done:** DC `POSTED` validates on-hand before OUT. |
| 1.2 | **Efficient on-hand / summary** | **Done:** SQL `GROUP BY` / `SUM` for stock summary. |
| 1.3 | **Ledger API** | **Done:** `date_from` / `date_to`, `limit` / `offset`, ordering. |
| 1.4 | **Document numbering** | **Done:** PO, GRN, DC, gate pass, process order, and MO auto-codes use `next_tenant_code` (`tenant_code_counters`, migration `070`) — same pattern as WT/ADJ. |
| 1.5 | **GRN vs PO close** | **Done:** PO closes only when cumulative received qty ≥ ordered per PO line; otherwise PO stays **APPROVED** (partial receipts). |
| 1.6 | **Safe deletes** | **Done:** `DELETE` on item / category / subcategory / unit / warehouse / stock group checks dependent rows and returns **409** with a clear message (no silent DB errors). |
| 1.7 | **Audit fields** | **Done:** nullable `created_by_user_id` (FK → `users.id`) on `stock_movements`, `goods_receiving`, `delivery_challans`, `warehouse_transfers`, `stock_adjustments` (migration `085`); set on creates and stock-posting paths; exposed on GRN/DC/transfer/adj responses and ledger rows where applicable. |
| 1.8 | **Numeric types & validation** | **Done (API layer):** Pydantic validators on PO/GRN/DC/transfer/adj/count lines (`app/common/inventory_validation.py`); **422** with clear messages. DB columns remain string/Numeric mix for now; incremental `DECIMAL` migrations can follow UAT. See **Phase 1.8 — Rounding policy** below. |
| 1.9 | **Indexes for hot paths** | **Done (initial):** composite index `ix_stock_movements_tenant_item_wh` on `(tenant_id, item_id, warehouse_id)` in migration `081_warehouse_transfers_and_stock_adjustments.py`. |

**Files:** `backend/app/modules/inventory/router.py` (split into smaller routers when this grows), `backend/app/models/inventory.py`, new Alembic migrations as needed.

### Phase 1.8 — Rounding policy (qty vs money)

- **Quantities (items, GRN/DC lines, transfers, adjustments):** Parse as decimal; reject invalid strings. **Positive** where a receipt/issue line must move stock; **non-negative** for counts; **signed non-zero** for adjustments. Store and display using enough precision for the unit of measure; round **display** totals to a sensible number of decimals (often **3** for pieces/kg in UI) without silently changing posted line strings server-side except where code already normalizes (e.g. transfer post uses `str(_to_float(line.quantity))`).
- **Money (PO line `unit_price`, amounts):** Parse as decimal; **non-negative**. Prefer **2 decimal places** for currency amounts in reports and PO totals; exchange rates may use more precision where stored as `Numeric(18, 6)`.
- **Principle:** Validate at the API boundary first; migrate hot columns to `DECIMAL` in the database when UAT agrees, without changing business rules in one big bang.

---

## Phase 2 — Features promised in the UI (parity)

| # | Task | Notes |
|---|------|--------|
| 2.1 | **Warehouse transfers** | **Done:** `warehouse_transfers` + lines, API, `WarehouseTransfersPage`; post creates paired OUT/IN with `reference_type=WAREHOUSE_TRANSFER`. |
| 2.2 | **Stock adjustments** | **Done:** `stock_adjustments`, API, `StockAdjustmentsPage`; signed qty draft; post creates IN (positive) or OUT (negative) with `STOCK_ADJUSTMENT`. |
| 2.3 | **Stock valuation report** | **Done (phase 1):** `GET /stock-valuation` = **default_cost** × on-hand; `StockValuationPage` + CSV. FIFO/moving average later. |
| 2.4 | **Stock dashboard** | **Done:** `GET /stock-dashboard` + `StockDashboardPage` (open POs, pending GRNs, SKUs in stock, low-stock count with threshold, recent movements). |
| 2.5 | **Lot / batch (optional)** | **Lot trace shipped:** `GET /lot-trace` + `LotTraceabilityPage` (search by lot on GRN lines and movements). Optional later: `lot_id` FK on movements/receiving lines everywhere for stricter batch control. |
| 2.6 | **Manufacturing order ↔ stock (decision)** | MO completion is currently **workflow-only** (no automatic `StockMovement` for finished goods). Decide whether completing an MO should post **IN** for `finished_item_id` (and optionally component **OUT** from BOM), or stay decoupled with explicit process orders/GRN — align with costing and shop-floor process. |

**Files:** backend router + models; new pages replacing `AppComingSoonPage` entries in `AppProtectedRouter.tsx`.

---

## Phase 3 — User experience & polish (frontend)

| # | Task | Notes |
|---|------|--------|
| 3.1 | **Stock Summary** | **Done:** warehouse filter, export CSV, sortable columns, hide zero on-hand. |
| 3.2 | **Stock Ledger** | **Done:** filters + load more + API params (see Phase 1.3). |
| 3.3 | **Consistent tables** | **Done:** Combined **Actions** dropdown on PO (`PurchaseOrdersPage`), GRN (`GoodsReceivingPage`), DC (`DeliveryChallansPage`), Purchase & AP workflow PO/GRN rows (`PurchaseWorkflowPage`), gate passes (`EnhancedGatePassesPage`), MO cards (`ManufacturingOrdersPage`), plus transfers/adjustments. |
| 3.4 | **Mobile** | **Done:** `GoodsReceivingPage` + `EnhancedGatePassesPage` use ~44px min-height controls, `touch-manipulation`, padded table rows; gate pass uses combined **Actions** dropdown (status + guard ack). |
| 3.5 | **Mobile list pages** | **Done:** `useInventoryListView` (`frontend/src/hooks/useInventoryListView.ts`) + `InventoryListViewToggle`, `inventoryScrollTableClass`, `touchFieldClass` (`frontend/src/components/inventory/InventoryMobileList.tsx`). On viewports &lt; `md`, users can switch **Table** vs **Cards** (preference in `localStorage` key `p7_inventory_list_view_v1`); wide tables get horizontal scroll + minimum widths; pagination and row **Actions** use ~44px tap targets where needed. Wired on Stock Summary, Ledger, PO, DC, Transfers, Adjustments, Dashboard; GRN/GP get scroll wrappers + min-width. |
| 4.2 | **Loading / empty / error** | **Done:** Shared components in `frontend/src/components/inventory/InventoryListStates.tsx` (`InventoryTableSkeleton`, `InventoryKpiStripSkeleton`, `InventoryCardListSkeleton`, `InventoryEmptyState`, `InventoryErrorPanel`, `InventoryValuationSkeleton`). Wired on Stock Summary, Ledger, Dashboard, Valuation, PO, GRN, DC, Gate Pass, MO, Transfers, Adjustments. |
| 4.3–4.4 | **Summary + Ledger UX** | **Done:** Stock Summary — client-side pagination (25/50/100 per page, prev/next, range label). Stock Ledger — API returns `{ items, total }` with **running balance** (window `SUM` signed qty per item+warehouse, chronologically); UI shows balance column + server-backed pagination. |

**Files:** e.g. `StockSummaryPage.tsx`, `StockLedgerPage.tsx`, PO/GRN/DC pages as needed.

---

## Phase 4 — Advanced (later)

| # | Task | Notes |
|---|------|--------|
| 4.1 | Barcode scan field on GRN/item lookup (camera or USB scanner). |
| 4.2 | Item images on master data. |
| 4.3 | Notifications (email/in-app) for low stock or GRN pending. |
| 4.4 | Align with **PrimeX** reference under `replit-legacy/primeX-ERP/` where parity is required (`docs/REFERENCE_PARITY.md`). |
| 4.5 | **AI assistant (optional)** | Wire or extend `backend/app/modules/ai_tool/tools/inventory_tools.py` so users can ask safe, read-only questions (stock levels, open POs) with the same tenant guards as APIs. |

---

## Already in place (baseline — do not re-scope as “new”)

These exist today; the plan above **extends** them rather than replacing them.

- Consumption control (finalize, snapshot, reservations, issue material, change requests).
- Reconciliation overview API + `InventoryReconciliationPage` (extend with exports/KPIs as needed).
- Process order issue with **on-hand check**; delivery challan **POSTED** idempotency (movements once).
- Vendors with search/filters; PO/GRN/DC/gate pass flows and list filters on several endpoints.

---

## Suggested order of implementation

1. **Phase 0** — avoids broken links and sets expectations.  
2. **Phase 1.1–1.3** — correctness and performance for real data volume.  
3. **Phase 2.1–2.2** — transfers + adjustments (high user value).  
4. **Phase 2.4 + 3** — dashboard and reporting UX.  
5. **Phase 1.4–1.9** and **Phase 2.3–2.5** — hardening, indexes, numeric types, and finance-grade features.

### Execution order (session planning)

Rough sequence aligned with the roadmap above:

| Block | Scope | Status |
|-------|--------|--------|
| A | Phase 0 (quick wins) | Done |
| B | Phase 1.1–1.3 (critical integrity) | Done |
| C | Phase 2.1–2.2 (transfers + adjustments) | Done |
| D | Phase 2.4 + Phase 3 UX (dashboard + table polish) | **2.4 + 3.1–3.5 done** |
| E | Phase 3 “detail” flows | PO/GRN/DC list actions unified (3.3); optional deeper detail routes later |
| F | Phase 1.4–1.7 + 2.3 (hardening + valuation) | **Done:** 1.4–1.7, 1.8 (API validation + audit `085`), 1.9, 2.3 |
| G | Phase 4–5 advanced + polish | Later (barcode, images, notifications, AI tools, etc.) |

---

## Key files (reference)

| Area | Path |
|------|------|
| Inventory API | `backend/app/modules/inventory/router.py` |
| Inventory models | `backend/app/models/inventory.py` |
| Routes | `frontend/src/app/AppProtectedRouter.tsx` |
| Sidebar | `frontend/src/app/sidebarConfig.tsx` |
| API client | `frontend/src/api/client.ts` |
| Stock master UI | `frontend/src/pages/app/InventoryItemsPage.tsx` |
| Warehouse transfers UI | `frontend/src/pages/app/WarehouseTransfersPage.tsx` |
| Stock adjustments UI | `frontend/src/pages/app/StockAdjustmentsPage.tsx` |
| Stock dashboard UI | `frontend/src/pages/app/StockDashboardPage.tsx` |
| Stock valuation UI | `frontend/src/pages/app/StockValuationPage.tsx` |
| Mobile list UX (Table/Cards, scroll) | `frontend/src/hooks/useInventoryListView.ts`, `frontend/src/components/inventory/InventoryMobileList.tsx` |
| Migration 081 | `backend/alembic/versions/081_warehouse_transfers_and_stock_adjustments.py` |
| Audit `created_by_user_id` (Phase 1.7) | `backend/alembic/versions/085_inventory_audit_created_by_user.py` |
| Qty/money API validation (Phase 1.8) | `backend/app/common/inventory_validation.py` |
| Item default warehouse (PO hints) | `backend/alembic/versions/086_items_default_warehouse_id.py`, `app/models/costing.py` (`Item.default_warehouse_id`) |

---

## Completion checklist (for future closure)

- [x] Sidebar links all resolve; no 404 on Adjustments (`stock-adjustments/new` route + “Soon” badges where still pending).  
- [x] DC posting validates stock before OUT movements (`router.py` delivery challan `POSTED`).  
- [x] Stock summary/ledger scalable and filterable.  
- [x] Transfers + adjustments implemented end-to-end (API + UI + migration `081`).  
- [x] Valuation + dashboard shipped (`/stock-valuation`, `/stock-dashboard`).  
- [x] Categories/subcategories routes redirect to Stock Master `?tab=masters`.  
- [x] Quantity/money validated at API per Phase 1.8 (Pydantic + shared helpers); DB type migration optional follow-up.  
- [x] Run `alembic upgrade head` on each environment after pulling migration `081` (use Docker backend: `docker compose exec backend alembic upgrade head` if local Python lacks deps).

---

## Implementation log

| Date | Items |
|------|--------|
| 2026-03-20 | Phase 0: `isSidebarNavItemActive` (fix `/app/inventory` over-matching), “Soon” badges, `/inventory/stock-adjustments/new` route, categories/subcategories → `?tab=masters`, `InventoryItemsPage` tab sync with URL. Phase 1.1–1.3: DC stock check, SQL `SUM`/`GROUP BY` stock summary, ledger `date_from`/`date_to`/`limit`/`offset` + Stock Ledger UI. |
| 2026-03-20 | Phase 2.1–2.2: `warehouse_transfers`, `warehouse_transfer_lines`, `stock_adjustments` + Alembic `081`; API endpoints; `WarehouseTransfersPage`, `StockAdjustmentsPage`; sidebar badges removed for Transfers/Adjustments. Phase 1.9: `ix_stock_movements_tenant_item_wh`. |
| 2026-03-20 | `_stock_summary_rows` helper; `GET /stock-valuation`, `GET /stock-dashboard`; partial GRN / PO close (Phase 1.5); `StockDashboardPage`, `StockValuationPage`; `StockSummaryPage` filters/CSV/sort/hide zero; sidebar badges removed for Dashboard & Valuation. |
| 2026-03-21 | Migration `081` applied via Docker; **Phase 1.4:** inventory document codes (PO, GRN, DC, GP, PRO, MO) use `next_tenant_code` instead of `max(id)`. |
| 2026-03-21 | **Phase 3.3:** Actions dropdowns on `PurchaseOrdersPage`, `GoodsReceivingPage`, `DeliveryChallansPage`, `PurchaseWorkflowPage` (PO/GRN AP bill rows). |
| 2026-03-21 | **Phase 4.1 (cursor plan):** `ManufacturingOrdersPage` — row-level **Actions** (View scroll, Start/Hold/Resume/Complete) replaces separate header buttons; aligns with `.cursor/rules/action-buttons.mdc`. |
| 2026-03-21 | **Phase 4.2:** `InventoryListStates.tsx` + loading skeletons, empty messages, and **Retry** on errors across main inventory list/report pages. |
| 2026-03-21 | **Phase 4.3–4.4:** `GET /stock-ledger` → `StockLedgerPageOut` (`running_balance`, `total`); ledger UI pagination + balance column; stock summary table pagination. |
| 2026-03-21 | **Phase 1.6:** safe-delete guards in `inventory/router.py` (409 + detail). **Phase 3.4:** GRN + Enhanced Gate Pass mobile-friendly tap targets; gate pass row actions in one dropdown. |
| 2026-03-21 | **Phase 3.5** (also tracked as cursor-plan “Phase 4.5 / mobile”): `useInventoryListView` + `InventoryMobileList` — narrow-only Table vs Cards toggle, `inventoryScrollTableClass` + min-width table wrappers, `touchFieldClass` / larger pagination on Stock Summary, Ledger, PO, DC, Transfers, Adjustments, Dashboard; GRN/GP scroll polish. |
| 2026-03-21 | **Phase 1.7–1.8 (Block F):** migration `085` — `created_by_user_id` on movements + GRN/DC/WT/ADJ; populated on create/post paths; ledger/dashboard include movement `created_by_user_id`; MFG material issue/return movements audited. **Phase 1.8:** shared validators for positive qty, non-negative money, signed adjustment qty, non-negative physical count; rounding policy documented above. |
| 2026-03-21 | **Per-item default warehouse:** migration `086` — `items.default_warehouse_id` (FK, `ON DELETE SET NULL`); Stock Master create/edit + list column; `POST /purchase-orders` fills missing line `warehouse_id` from item default then tenant `default_rm_warehouse_id` (084); warehouse delete guard includes items using it as default; PO UI picks item’s default when changing line item. |
