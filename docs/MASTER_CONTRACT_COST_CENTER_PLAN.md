# Master Contract / LC as Cost Center – Implementation Plan

> **Goal:** Make Master Sales Contract / Master LC the **central reference point** (cost center) for the entire garment export lifecycle – from orders through raw material procurement, utilization, BTB LC, payments, and profit/loss.

---

## 1. The Document Chain (Enforced Linkage)

```
Orders (Style No., Order No.)
   │
   ▼
Proforma Invoice (PI)        ← must have ≥1 order linked
   │
   ▼
Master Sales Contract / LC   ← must have ≥1 PI linked
   │
   ▼
Back-to-Back LC (BTB)        ← must have a Master Contract/LC
   │
   ▼
Purchase Orders (raw material)← linked to BTB LC → linked to Master Contract
```

### Current state
- `ProformaInvoiceOrder` junction table exists (PI ↔ Orders ✅)
- `ProformaInvoice.master_contract_id` exists (PI → Master Contract ✅)
- `BtbLc.master_contract_id` exists (BTB → Master Contract ✅)

### What needs enforcing
| Rule | Current | Needed |
|------|---------|--------|
| PI must have ≥1 order | Not enforced | API validation on create/finalize |
| Master Contract must have ≥1 PI | Not enforced | API validation on activate |
| BTB LC must reference a Master Contract | Optional FK | Make required on create |
| Purchase Order should reference BTB LC / Master Contract | No FK | Add `master_contract_id` + optional `btb_lc_id` on PO |

---

## 2. Master Contract = Cost Center (The Core Idea)

### Why?
A financier doesn't think in "cost center codes." They think:
- *"I gave you an LC for $500,000 – show me where every dollar went."*
- Per Master Contract/LC they want to see: raw material purchases, receipts, utilization, waste, BTB LCs opened, BTB maturity dates, payments made, shipments, and final profit/loss.

### How it works today (partial)
- `MasterContract.cost_center_id` → auto-created `CostCenter` on contract creation
- `VoucherLine.cost_center_id` → finance vouchers tagged to cost center
- BTB LC opening/realization creates vouchers tagged to the master contract's cost center

### What's missing
The cost center linkage exists at the **voucher level** but there is **no unified dashboard** that aggregates everything per Master Contract. Also, inventory/purchase flows are not linked.

---

## 3. Schema Changes Needed

### Phase A: Strengthen existing links

#### A1. Add `master_contract_id` to Purchase Orders
```sql
ALTER TABLE purchase_orders ADD COLUMN master_contract_id INTEGER
    REFERENCES master_contracts(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN btb_lc_id INTEGER
    REFERENCES btb_lcs(id) ON DELETE SET NULL;
```
This lets us trace: Master Contract → BTB LC → Purchase Order → GRN (goods received)

#### A2. Add `master_contract_id` to inventory movements (optional but powerful)
```sql
ALTER TABLE inventory_transactions ADD COLUMN master_contract_id INTEGER
    REFERENCES master_contracts(id) ON DELETE SET NULL;
```
When raw material is issued to production for a specific order/style under a master contract, this tags the movement.

#### A3. Ensure PI → Orders enforcement
- Backend: Validate `order_ids` is non-empty on PI create (export direction)
- Frontend: Require at least one order selection in PI form

#### A4. Ensure Master Contract → PI link is queryable
- Currently `ProformaInvoice.master_contract_id` is the link
- Add a **reverse query**: API endpoint to list all PIs for a master contract
- Add a **deep reverse query**: Master Contract → PIs → Orders (with style nos.)

---

## 4. Master Contract Detail Page (The Big New Page)

This is the **central hub**. When you open a Master Contract, you see everything.

### Layout: Tabbed Detail Page at `/app/commercial/master-contracts/:id`

#### Tab 1: Overview
- Contract type (Sales Contract / Export LC), reference, status, dates
- Amount, currency, buyer, bank
- BTB utilization bar (current % of 70% cap)
- Cost center code (auto-linked)
- Key dates: contract date, expiry, shipment deadline

#### Tab 2: Orders & PIs
- **Linked PIs** table (reference, date, amount, status)
  - Under each PI: linked orders (order code, style ref, quantity, amount)
- KPI summary: total order quantity, total PI value vs contract value
- Action: Link/unlink PI (if contract is DRAFT)

#### Tab 3: Raw Material & Procurement
- **Purchase Orders** linked to this contract (via `master_contract_id` or via BTB LC)
  - PO reference, vendor, items, amount, status
- **Goods Received Notes (GRN)** for those POs
  - What was ordered vs what was received
- **Material Utilization** (from production/consumption plans linked to orders under this contract)
  - Material name, required qty, issued qty, consumed qty, waste/leftover
- **Leftover Stock** = received − consumed

#### Tab 4: Back-to-Back LCs
- All BTB LCs under this Master Contract
  - Reference, vendor, amount, status, maturity date
  - Payment status (open / documents accepted / realized)
- Utilization summary: total BTB opened vs master contract amount
- Maturity calendar/timeline

#### Tab 5: Financial Summary (P&L per Contract)
- **Revenue side:**
  - Master Contract amount (export value)
  - FX receipts / payments received
- **Cost side:**
  - Raw material purchases (sum of POs)
  - BTB LC amounts
  - Bank charges, commission
  - Other expenses (vouchers tagged to this cost center)
- **Profit/Loss** = Revenue − Total Costs
- **Margin %**

#### Tab 6: Financier View (what the financier portal shows)
- Same data as Tab 5 but formatted for external consumption
- BTB maturity dates and payment obligations
- Stock collateral value (leftover raw material)
- Risk indicators

---

## 5. Financier Portal Integration

The financier portal already has pages for:
- Dashboard, loan portfolio, credit lines, business health
- Procurement tracker, stock collateral, traceability

### Enhance with Master Contract focus:
- **Per-LC/Contract drill-down** in financier portal
- Financier selects a Master Contract/LC → sees the same Tabs 3-5 data
- Add endpoints: `GET /api/external/financier/master-contracts` (scoped to tenant)
- Add endpoint: `GET /api/external/financier/master-contracts/{id}/summary` (aggregated P&L, material, BTB data)

---

## 6. Implementation Phases

### Phase 1: Schema & Chain Enforcement (Backend) — ~2-3 sessions
1. Migration: Add `master_contract_id` and `btb_lc_id` to `purchase_orders`
2. Migration: Add `master_contract_id` to `inventory_transactions` (optional)
3. API: Enforce PI must have ≥1 order on create (export direction)
4. API: Enforce BTB LC must have `master_contract_id` on create
5. API: Add reverse-query endpoints on master contract (list PIs, list orders, list BTBs, list POs)
6. API: When creating PO from BTB LC, auto-set `master_contract_id`

### Phase 2: Master Contract Detail Page (Frontend) — ~2-3 sessions
1. Create route `/app/commercial/master-contracts/:id`
2. Build tabbed layout with Overview, Orders & PIs, Procurement, BTB LCs tabs
3. Wire to existing + new API endpoints
4. Add navigation from list page → detail page

### Phase 3: Financial Summary per Contract (Backend + Frontend) — ~2 sessions
1. Backend service: Aggregate P&L per master contract
   - Revenue: contract amount, FX receipts tagged to cost center
   - Costs: PO amounts, BTB amounts, voucher lines on cost center
2. API endpoint: `GET /api/v1/commercial/master-contracts/{id}/financial-summary`
3. Frontend: Financial Summary tab on detail page
4. Enhance existing LC Profitability page to use this service

### Phase 4: Material Tracking per Contract (Backend + Frontend) — ~2 sessions
1. Backend: Query consumption plans → orders → PIs → master contract chain
2. Backend: Query GRNs via POs linked to master contract
3. API: `GET /api/v1/commercial/master-contracts/{id}/material-summary`
4. Frontend: Raw Material & Procurement tab

### Phase 5: Financier Portal Enhancement — ~1-2 sessions
1. External API: Master contract list + detail for financier
2. Financier portal: Add "Contract Drill-down" page
3. Map existing financier pages to use master contract as grouping key

---

## 7. KPI Tracking (Style No., Order No., Master LC/Contract)

### The hierarchy:
```
Master Contract/LC  (top-level cost tracking unit)
  └── PI(s)
       └── Order(s)
            └── Style(s)     (style_ref on order)
                 └── BOM → Materials → Purchase → Receive → Issue → Consume
```

### Report dimensions:
- **By Master Contract:** Total P&L, material utilization, BTB status
- **By Order:** Which orders are under which contract, their completion %
- **By Style:** Material consumption per style, waste %, profitability

### Dashboard KPIs (Master Contract list page):
- Contract value vs shipped value
- BTB utilization % (with color bands - already exists)
- Material procurement % (ordered vs required)
- Payment collection % (received vs contract value)
- Days to expiry
- Open BTB count and nearest maturity

---

## 8. Data Flow Diagram

```
[Customer] ──places──▶ [Order] (style_ref, qty, price)
                           │
                    ──creates──▶ [Proforma Invoice] (groups orders for buyer)
                                       │
                              ──opens──▶ [Master Contract/LC] (bank-backed value)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                              [BTB LC #1] [BTB LC #2] [BTB LC #3]  (for diff vendors)
                                    │         │         │
                                    ▼         ▼         ▼
                              [PO #1]    [PO #2]    [PO #3]  (raw material orders)
                                    │         │         │
                                    ▼         ▼         ▼
                              [GRN #1]   [GRN #2]   [GRN #3]  (goods received)
                                    │         │         │
                                    ▼         ▼         ▼
                              [Issue to Production] ──▶ [Consumption] ──▶ [Finished Goods]
                                                                              │
                                                                    ──ships──▶ [Shipment]
                                                                              │
                                                                    ──pays──▶ [FX Receipt]

All financial vouchers tagged with Master Contract's Cost Center
═══════════════════════════════════════════════════════════════
Financier sees: MC value, BTB opened, material bought, stock in hand,
                BTB maturity, payments received, P&L
```

---

## 9. Existing Code Touchpoints

| File | What to change |
|------|----------------|
| `backend/app/models/commercial.py` | Already has `MasterContract`, `ProformaInvoice`, `BtbLc` — add relationships |
| `backend/app/models/merch.py` | `Order` — no changes needed, linked via `ProformaInvoiceOrder` |
| `backend/app/models/inventory.py` | Add `master_contract_id` to relevant models |
| `backend/app/modules/commercial/router.py` | Add validation, reverse queries, detail endpoints |
| `backend/app/modules/commercial/schemas.py` | New schemas for detail/summary responses |
| `frontend/src/pages/app/commercial/MasterContractsPage.tsx` | Add link to detail page |
| `frontend/src/pages/app/commercial/MasterContractDetailPage.tsx` | **NEW** — the big detail page |
| `frontend/src/app/AppProtectedRouter.tsx` | Add route for detail page |
| `backend/app/external_access/financier_portal/router.py` | Add master contract endpoints |

---

## 10. Priority Recommendation

**Start with Phase 1 + Phase 2** — get the chain enforced and the detail page built. This gives immediate visibility. Then layer on financial summary (Phase 3) and material tracking (Phase 4). Financier portal (Phase 5) comes last since it consumes the same backend services.

The Master Contract Detail Page becomes the **single source of truth** for any export — just like how in real life, when a financier asks "show me LC number XYZ," you pull out one folder with everything in it.
