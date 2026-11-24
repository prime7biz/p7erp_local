# Raw Material & Goods Control — Master Plan

**Mode:** ADVANCED (CRITICAL for money/stock writers).  
**Decision:** Deliver tracks **A** (Plan & Budget), **B** (Store Ops), and **C** (Commercial + Accounts) in every phase.  
**Living detail:** Cursor plan `rm_goods_control_40e9ba51.plan.md`.

## Tracks

| Track | Name | Meaning |
|-------|------|---------|
| **A** | Material Plan & Budget | BOM → buy qty → allocation → budget vs actual → BTB/MSC/UD headroom |
| **B** | Factory Store Ops | Lot/QC → issue/return → leftover/damage → physical count → gate/challan |
| **C** | Commercial + Accounts | BTB → PO/GRN → claims/DN/RTV → VendorBill / GRNI |

## Style-first demand (owner-locked)

- **Style** (with colourways) is the primary key of raw material. Order, PI, MSC/LC, BTB, BOM, and subcontract are linked dimensions.
- **Normal flow:** Style created/selected on **Inquiry** → Quotation → Order → Order BOM → PI → MSC → BTB.
- **Subcontract (Inbound Job Work):** Style may be created from the job-work contract. Materials are **style-wise requirements from the principal factory** — **no BOM sheet**, zero value, qty-only ledger (`job_work_*`). Never PO / FIFO / inventory GL / our BTB / our UD.
- Buy formula (Order BOM): `required_gross = order_qty × net × (1 + wastage% + process_loss%)`.

## Dual path risk (document honesty)

| Path | Valued? | Source of requirement |
|------|---------|------------------------|
| Style BOM / Order BOM | Yes | Bought material → PO → GRN → FIFO → GRNI → VendorBill |
| Job-work style-wise schedule | No | Principal free-issue → `job_work_material_ledger` only |

Prefer **Order BOM** for buy when an order BOM exists. Soft-deprecate leading with style-BOM material-requirement UI later (Phase 7).

## Factory document map (Track B)

| Document | Role today |
|----------|------------|
| GRN + optional QC | Receive; quarantine when QC flag on |
| PMI | **Canonical** order material issue |
| ProcessOrder / IDT | Conversion + process loss / cost lines |
| Warehouse transfer | Inter-WH move |
| Delivery Challan | Bought FG / goods outward (stock + COGS) |
| Enhanced Gate Pass | Gate control; Class 1 ratification exists when authority flag on |
| Stock adjustment / physical session | Count / damage |
| Job-work receive/consume/return | Customer material only (outward note, not stock challan) |

Leftover today is largely analytics (INV-18); Phase 4 returns bought leftover to store with FIFO.

## Commercial spine (Track C)

```text
PO → GRN → GRNI accrual → VendorBill clears GRNI → AP
BTB: OPEN → DOCUMENTS_ACCEPTED → REALIZED (70% MSC band)
DN / RTV / exchange: bought material only (customer material → principal claim payable)
```

## Hub information architecture

Material Control under Inventory (HR-hub pattern). Legacy routes redirect and keep query.

| Hub | Tabs (flag-gated marked *) |
|-----|----------------------------|
| Overview | Today's Action Queue, Style Control Sheet, By order, Cost-Saving Watchlist*, Genealogy |
| Plan | Consumption, Allocate*, Reconcile, UD*, Job Work link* |
| Buy | PO (Reuse-Before-Buy*), BTB, Requisitions* |
| Receive | GRN, QC*, Quality board*, Supplier Scorecard* |
| Move | PMI, Gate, Challan, Transfers, Job-Work Bond Transfers* |
| Convert | Process, IDT*, Loss* |
| Exceptions | Adjustments, Wastage, Physical*, Unclaimed Defects* |
| Money | AP, Unbilled GRNI, Vendor bills, DN/RTV*, UD*, Principal Claims* |

## Phase order

| Phase | Flag | Focus | Status |
|-------|------|--------|--------|
| 0 | — | Docs (this folder) | Done |
| 0.5 | — | CRITICAL integrity: GRN FX, PMI locks, GRNI resolver, DN+FIFO, job-work zero-value test | Done |
| 1 | `material_control_hub_v1` | Hub + Style Control Sheet + Action Queue + Genealogy (read-only) | Done |
| 2A | `material_inbound_v2` | Style/colourway tags, subcontract binding, Reuse-Before-Buy, BTB warn | Done |
| 2B | `material_alloc_ud_v1` | FIFO-layer allocation + UD event ledger | Done |
| 3 | QC + hub | QC hold blocks issue, draft DN, supplier scorecard | Done |
| 4 | `material_conversion_v1` | Leftover return + **Gate/Challan Class 3/4→2→1 pre-release** | Done |
| 5 | `material_physical_v1` | Stock adjustments link + job-work bond transfer + principal claim | Done |
| 6 | `material_returns_v1` | RTV / exchange | Done |
| 7 | `material_budget_plan_v1` (+ `material_landed_cost_v1`) | 5-leak watchlist; rolls/shade; landed cost onto FIFO | Done |
| 8 | `material_commitment_block_v1` | Hard BTB/MSC blocks + FIN-18 one VendorBill per GRN | Done |

## Gate Pass & Delivery Challan (owner-locked)

When `user_authority_classes_v1` is ON:

1. **Enter:** Class 3 or 4 (inventory grant)  
2. **Recommend:** Class 2  
3. **Approve:** Class 1 (≠ creator and ≠ recommender)  
4. **Release / post:** blocked until approved  

Flag OFF → legacy role permissions. Other documents keep existing role policy.

## Locked decisions (summary)

1. Style-first; Inquiry creates Style; job work can create Style without BOM.  
2. Job-work materials = zero value; principal maintains UD.  
3. Bond transfer = job-work materials only (dedicated table, not our UD register).  
4. Customer claim = separate payable to **principal factory**, with settlement events.  
5. Shared style stock = explicit FIFO-layer allocation per order.  
6. PMI = canonical issue; leftover bought = same-item return to store.  
7. QC inspector = ERP user (no HR employee FK).  
8. Show both bank UD wastage and factory process loss.  
9. UD track per contract **and** per BTB/PO.  
10. Gate/Challan Class 3&4 → Class 2 → Class 1 pre-release.

## Factory KPIs (glossary)

| KPI | Meaning |
|-----|---------|
| Material readiness days | Days before cut that usable stock covers BOM need |
| Booking / PO / received % | Planned vs ordered vs received |
| BTB / UD headroom % | Residual entitlement vs commitments |
| Fabric pass rate / claim recovery | QC pass %; DN/RTV recovered vs rejected value |
| Actual vs BOM % | Issued (net of leftover) vs standard |
| Wastage by bucket | Process / waste / remnant / shortage |
| Remnant aged value | Leftover FIFO value by age band |
| GRNI aging | Unbilled received value by age |
| Inventory accuracy | Physical vs system after count |

## Must-have vs deferred

**Must:** BOM shortage + Reuse-Before-Buy, lot/QC hold, shade issue, budget vs actual, leftover return, DN/claim, BTB/UD hooks, job-work zero-value firewall, Style Control Sheet.  

**Defer:** CAD AI, NBR/e-UD filing, remnant marketplace, QR roll sticker + phone scan (follow-up).

## CRITICAL gates

Phases **0.5, 2A, 2B, 4, 5, 6, 8** need focused tests + independent security review before merge. Premium agents only if the owner asks.
