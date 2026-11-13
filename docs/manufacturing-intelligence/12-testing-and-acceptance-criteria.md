# 12 - Testing and acceptance criteria

All backend tests run in Docker: `docker compose exec backend pytest tests/test_mfg_intelligence_*.py -q`.
Frontend: `npm run lint`, `npm run build`, `npx vitest run <files>` in `frontend/`. Never against live data.

## 1. Phase 1 acceptance criteria and tests

| # | Criterion | Test |
|---|---|---|
| A1 | Flag OFF: every endpoint returns 404 and no panel shows | `test_mfg_intelligence_flag_off.py` |
| A2 | Another tenant's order id returns 404 "Order not found" | `test_mfg_intelligence_tenant_isolation.py` |
| A3 | Data of tenant B never appears in tenant A's capacity / line loading / summary | same |
| A4 | Corrected capacity never multiplies machines by operators | `test_mfg_intelligence_capacity.py` |
| A5 | Two shifts sum operator minutes | same |
| A6 | Missing shift, SMV, operators or efficiency returns UNKNOWN with `missing_inputs` | same |
| A7 | Closed calendar days have zero capacity (`CLOSED_DAY`) | same |
| A8 | Legacy value reproduces the old advisory formula; corrected shown only with `planning_math_v2` | same |
| A9 | SMV per piece = OB `total_smv` (not divided by qty) | `test_mfg_intelligence_smv.py` |
| A10 | Booking load spread over working days between start and planned end | `test_mfg_intelligence_line_loading.py` |
| A11 | Soft load never reduces firm availability; cancelled / completed rows consume nothing | same |
| A12 | Window > 180 days rejected with 422 | same |
| A13 | Active approved / frozen Order BOM used when `mfg_order_bom_readiness_v2` ON | `test_mfg_intelligence_readiness.py` |
| A14 | Style-BOM-only order is STYLE_ESTIMATE and never fully ready | same |
| A15 | Blockers listed separately from informational items | same |
| A16 | DRAFT, CANCELLED, COMPLETED orders are not confirmed demand | `test_mfg_intelligence_confirmed_demand.py` |
| A17 | Delivery prediction: on track, at risk, late and UNKNOWN cases vs `delivery_date` | `test_mfg_intelligence_delivery.py` |
| A18 | GET endpoints perform no INSERT / UPDATE / DELETE on domain tables | `test_mfg_intelligence_read_only.py` |
| A19 | New routes carry `production.planning.read` | `test_route_permission_inventory.py` |
| A20 | Permission explicitly denied (`production.planning.read: false` under RBAC enforce) returns 403 | `test_mfg_intelligence_tenant_isolation.py` |
| A21 | Panels render, show Legacy vs Corrected labels, and show UNKNOWN states | `ControlTowerManufacturingIntelligence.test.tsx` |

## 2. Phase 2+ mandatory tests (from the verification)

- **F-T1** `test_mfg_material_allocation_flag_off_golden.py`: legacy SOFT / HARD rows and new ACTIVE rows; flag OFF;
  availability, promise, readiness, MRP and reorder payloads identical to golden fixtures.
- **F-T2** `test_mfg_inbound_supply_conservation.py`: PO 1,000, accepted 300, hard peg 400 ->
  `on_order_net` 700, hard 400, free 300; tentative peg 200 -> stressed free 100.
- **F-T3** `test_mfg_material_allocation_concurrency.py`: two orders race for the same stock, one wins; cancel /
  amend / retry idempotent; cross-tenant ids not found.
- **F-T4** capacity UNKNOWN without shift / SMV; **F-T5** Order BOM wins; **F-T6** SMV per piece; **F-T7** MRP
  on-order nets receipts and excludes fully received.

## 3. Edge cases (to cover across phases)

Zero operators; machine breakdown; missing SMV; partial material; late supplier; cancelled order; quantity
amendment; several orders sharing one material; one order split across lines; line change during production;
delivery date amendment; rework; insufficient working capital; simultaneous planning changes; missing history;
expired tentative booking; quarantined / HOLD stock; partial PO receipt; same employee or machine on two lines.

## 4. Synthetic dataset

Two factory units, six sewing lines, two shifts, holidays, ten styles with approved OBs, fifteen confirmed orders
plus drafts / cancelled, shared fabric, partial stock and open POs, split line plans, and a **second tenant with
overlapping data** to prove isolation. Built inside tests only; live data is never modified.
