# 01 - Existing system audit (Manufacturing Intelligence)

Date: 2026-11-12. Method: three read-only explorations (Gemini 4 Carbon) covering production/capacity,
the merchandising-to-materials chain, and finance/HR/AI/infrastructure. The most important defects were
re-checked directly in code by the parent agent. Line numbers refer to the code on that date.

Classification legend: **Working** = existing and working; **Improve** = existing but needs improvement;
**Disconnected** = existing but not wired to the rest; **Partial** = partially implemented; **Missing**;
**Duplicate**; **Verify** = requires verification.

## 1. Big picture

Prime7 has far more manufacturing functionality than a first look suggests. The main problem is not
missing features but **three overlapping production stacks** and **disconnected calculations**:

| Stack | Location | Centre of gravity | Key tables |
|---|---|---|---|
| Garment production (canonical) | `backend/app/modules/production/` | Style, operation bulletin (OB), SMV, sewing line | `sewing_lines`, `sewing_line_style_configs`, `operation_bulletins`, `hourly_production_entries`, `cutting_bundles`, `bundle_operation_scans`, `knitting_work_orders`, `dye_batches`, `production_qc_checks`, `line_crew_daily`, `worker_skills`, `cm_cost_actuals` |
| Discrete manufacturing | `backend/app/modules/manufacturing/` | Item, routing, work centre | `mfg_work_centers`, `mfg_production_plans`, `mfg_work_orders`, `mfg_mrp_runs`, `mfg_downtime_events`, `mfg_quality_checks`, `mfg_ncrs`, `mfg_capas`, `mfg_tna_plans`, `mfg_sample_requests` |
| Inventory process / MRP | `backend/app/modules/inventory/` | Stock conversion | `process_orders`, `inter_department_transfers`, `production_material_issues`, `planned_orders` (`mrp_engine_service.py`, flag `mrp_engine_enabled` OFF) |

Note: `backend/app/models/facility.py` (`facilities`) is **bank credit facilities**, not factory plant.

## 2. Existing versus proposed functionality matrix

| Capability | What exists today | Class | Proposed (phase) |
|---|---|---|---|
| Factory calendar, shifts, holidays | `production/calendar_service.py`, `settings_router.py`, `production_shifts`, `factory_calendar_overrides` | Working | Reuse as capacity input (P1) |
| Sewing line master | `sewing_lines` (factory_unit, machine/operator/helper counts) | Working | Reuse (P1) |
| SMV / operation bulletin | `operation_bulletins.total_smv` = sum of op SMVs per piece (`ie_router.py:108`) | Working | SMV source hierarchy (P1), style standard SMV (P2) |
| Line capacity calculation | `planning_advisory_service.py:91` machines x operators x minutes (wrong), shift average | Improve (defect) | Corrected operator-minute capacity (P1) |
| Line plan / booking rows | `sewing_line_style_configs` with `reservation_status` DRAFT, SOFT_BOOKED, FIRM_BOOKED, IN_PROGRESS, COMPLETED, CANCELLED | Partial | Read in P1; confidence/expiry/revisions in P2 |
| Line reservation lifecycle | `line_reservation_service.py` propose / confirm-soft / confirm-firm / release | Disconnected (no UI callers) | Booking UI with revisions (P2) |
| Drag-drop Gantt | `ProductionLinePlanPage.tsx` (max 62 days) | Working, limited | Up to 180 days via line-loading API (P1/P2) |
| Capacity heatmap | `control_tower/service.py:164` - all SMV on `start_date` | Improve (defect) | Spread over working days (P1) |
| Work-centre "load %" | `manufacturing/planning_router.py:431` = completed / planned | Improve (mislabel) | Not used; corrected metrics in new API (P1) |
| Production readiness | `production/readiness_service.py` (TNA, samples, materials, line) | Improve | Gate-based readiness, Order BOM (P1 read-only; P2 full) |
| Material requirement | `merch/routers/consumption.py`, `orders/promise_checks.py`, `readiness_service.py` read latest **Style** BOM | Improve (defect) | Active Order BOM authority (P1 flag) |
| Stock reservations | `stock_reservations` table, 3 readers, **zero writers** | Partial | Reservation taxonomy + writers (P2) |
| Inbound PO supply | `stock_availability_service.py` sums open PO balance per item (not per order) | Improve | Single `open_po_supply_service` + pegging (P2) |
| MRP | Inventory MRP (`mrp_engine_service.py`, OFF) + shallow manufacturing MRP (UI "What-if / MRP") | Duplicate | Shared net open supply (P2) |
| Hourly production | `hourly_router.py`, `HourlyProductionPage.tsx` (no order / line-plan picker) | Improve | Link to plan, completed qty (P2) |
| Bundle scan station | `scan_router.py` + offline queue | Working | Empirical capacity source (P4) |
| Cutting, knitting, dyeing, process orders | `cutting_router.py`, `knitting_router.py`, `dyeing_router.py`, `process_orders` | Working | Upstream supply stages (P2) |
| Crew / attendance per line | `line_crew_daily`, `sync_crew_actual_present` (factory-wide pool per line, manual) | Improve (defect) | Dated employee-line assignments (P2) |
| Operator skills | `worker_skills` (text level) | Partial | Skill constraint (P2) |
| Machines, downtime, maintenance | `department_machines` (no PATCH/DELETE), `mfg_downtime_events` (no machine/line FK) | Partial | Machine-line assignments (P2) |
| Quality | Three QC stacks: `production_qc_checks`, `mfg_quality_checks`/NCR/CAPA, `grn_quality_inspections` | Duplicate | Read-only inputs (P4) |
| CAPA blocks challan | `capa_blocks_challan`; NCR/CAPA never set `order_id` | Improve (defect) | Behaviour change, needs approval |
| TNA | Merch `order_followup_actions` (canonical) + `mfg_tna_plans` + simple `order_followups` | Duplicate | Merch TNA canonical (P1 read) |
| Samples | `merch_sample_requests` (canonical) + `mfg_sample_requests` | Duplicate | Merch samples canonical |
| Order lifecycle | Legacy `status` + auto `pipeline_status`; quotation-made orders stay `NEW` (`workflow.py:50`) | Improve | Confirmed demand = status NEW/CONFIRMED/IN_PROGRESS (decided) |
| Delivery dates | `Order.delivery_date` only (= ex-factory, decided); ExportCase / TradeCase ETD/ETA | Partial | Deterministic delivery prediction (P1) |
| Pipeline demand | Inquiry qty + expected date; quotation projected qty/date; probabilities hardcoded display-only | Disconnected | Tentative demand class (P2), forecasting (P5) |
| Procurement dates | BOM to PO leaves `expected_date` NULL; vendor has no numeric lead time; supplier portal ETA not fed back | Partial | ETA chain (P2) |
| Costing | Quotation cost sheets, material variance, CM actuals (float, currency mix, manual), WIP/job-work | Duplicate / Improve | Classified cost intelligence (P3) |
| Cost centres | Master Contract owns cost centre (auto-created) | Working | Reuse (P3) |
| Cost-centre dashboard | Sums `VoucherLine.amount` incl. unposted (`finance/router.py:4426`) | Improve (defect) | Posted, base currency (P3) |
| Cash forecast | Three implementations with synthetic multipliers | Duplicate | Schedule-driven cash need (P3) |
| Alerts | `merch/alert_engine.py`, 15 rules, natural-key dedupe | Working | Reuse for bottleneck alerts (P4) |
| Governed AI | `governed_ai/` detectors, `ai_agent_decisions`, human confirm | Working | Reuse for recommendations (P4) |
| AI chat agent tools | `ai_tool/agent/catalog.py` 20 read-only tools | Working | Add planning read tools (P4) |
| Control Tower | `control_tower/` + `ControlTowerPage.tsx` (flag `control_tower_enabled`, 180-day window) | Working | UI shell for intelligence panels (P1) |
| Background jobs | Celery beat + in-process schedulers; CM and crew sync manual | Partial | Scheduled recompute (P2+) |
| Event bus | None (synchronous hooks) | Missing | Not introduced; on-demand + Celery |

## 3. Module-by-module summary

### Marketing / merchandising
- **Inquiries** (`modules/inquiries/router.py`): DRAFT, SUBMITTED, CONVERTED, LOST, CANCELLED. Stores `quantity`,
  `expected_delivery_date`. Working; not connected to capacity.
- **Quotations** (`modules/quotations/router.py`): full cost sheet (`quotation_materials`, `quotation_manufacturing`
  with `machines_required`, `production_per_hour`, `cm_per_piece`). Working; manufacturing fields unused by planning.
- **Orders** (`modules/orders/`): single style per order with optional colour x size lines. Two status fields.
  `create_order_from_quotation` sets `NEW`, and `NEW` can only go to `CANCELLED` (`common/workflow.py:50`).
- **Styles** (`merch/routers/styles.py`): no SMV column; `sample_lead_days` and `production_lead_days` unused.
  Tech packs / measurement charts are Missing (`merch/plm_stubs.py`).
- **BOM**: Order BOM (`/merch/order-boms`, unique active per order `uq_boms_tenant_order_active`) is governed;
  classic style BOM and consumption plans duplicate it.
- **TNA / samples**: merch follow-up actions with 18 seeded milestones (calendar-day offsets).

### Commercial
- PI, Master Contract (owns cost centre), BTB LC (70 % cap sums every BTB regardless of status/currency).
  Master Contract has `expiry_date` but no latest shipment date.

### Procurement / inventory
- PR/CS module is isolated from orders/BOMs (no FK) and off by default.
- Four PO generation paths. Bulk BOM to PO counts cancelled POs as already ordered and nets no stock.
- GRN: quarantine QC (`grn_quality_inspection_enabled` OFF) does not refresh PO status or order RM %; HOLD strands stock.
- Four inconsistent on-hand formulas (ADJUST handled three different ways).
- Four material issue paths (PMI, consumption control, manufacturing issue, process order/IDT) without a shared cap.

### Production
- Planning: `production/planning_router.py`, `pipeline_service.py`, `readiness_service.py`, `plan_conflicts.py`,
  `suggest_service.py` (hardcoded 65 % efficiency, 480 min, 25 operators, SMV 12), `replan_service.py` (calendar days).
- Shop floor: cutting, bundles, scan station, hourly entry for 11 departments, knitting, dyeing.

### HR
- Attendance (device, iClock, manual), leave, OT rules, payroll, BD labour catalog
  (`hr_localization/bd_rmg_catalog.py`: 8 h/day, 48 h/week, max 60 with OT, 2x basic OT). Working.
- No employee-to-sewing-line link; `hr_sections` are unrelated to `sewing_lines`.

### Finance
- Voucher posting modules: finance, commercial, commission, facility, hr_payroll, inventory, production.
- Budget vs actual (`budget_vs_actual_service.py`) uses posted, base-currency lines: Working and reusable.
- Profitability endpoints are quotation estimates; the variance endpoint matches `Voucher.reference == order_code`
  which auto-posted vouchers never use.

### AI
- Governed AI, AI chat agent, Gemini planning prompts (no manpower/skill/cost context), heuristic "predictions"
  with hardcoded defect names, no persistence of planning recommendations.

## 4. Reusable building blocks (must reuse, not rebuild)

1. Alert engine (`merch/alert_engine.py`, `models/alert.py`).
2. Governed AI (`governed_ai/`, `ai_agent_decisions`).
3. AI chat agent tool loop (`ai_tool/agent/`).
4. `generate_text_for_tenant` (OpenRouter / Gemini).
5. Operations Control Tower (`control_tower/`, `ControlTowerPage.tsx`).
6. HR compensation, OT and attendance services.
7. Inventory FIFO valuation and order material variance.
8. LC performance, facility exposure, budget vs actual.
9. Finance drill-down (`frontend/src/lib/financeDrilldown.ts`), `record_doc_event`, `log_action`.
10. Security primitives: `require_tenant`, `ensure_owned`, `bind_session_tenant`, RLS migration 270,
    `permissions.py` registry, `test_route_permission_inventory.py`, Celery `run_async`, `background_lock`.

See `02-current-workflow-and-gaps.md` for the defect list.
