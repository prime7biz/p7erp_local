# 03 - Module-wise AI Opportunities

Part of the Prime7 AI strategy set. Index: [`AI_DEVELOPMENT_MASTER_PLAN.md`](../../AI_DEVELOPMENT_MASTER_PLAN.md).

**Audit date:** 2026-11-04
**Principle:** Use the simplest method that works. Business rules, SQL analytics and simple statistics come first. LLMs explain and summarise; they never produce the numbers. Machine learning is considered only where dense, labelled history exists.

**Difficulty:** L = days to one sprint, M = one to three sprints, H = several sprints or needs new data capture first.

**Method codes:** Rules = business rules / SQL; Stat = simple statistics (moving average, EWMA, median); Heur = weighted heuristic score; LLM = narrative / extraction only; ML = trained model.

Data availability below is from the schema (models and tables). How much history each tenant actually has is **unknown** and must be checked on live data (Runtime-verify).

---

## 0. Already built - extend, do not rebuild

| Capability | Path | Method |
|---|---|---|
| Order cost / profitability variance | `backend/app/modules/merch/costing_variance_service.py` | Rules |
| Quotation peer cost benchmarks | `backend/app/modules/quotations/quotation_cost_benchmark_service.py` | Stat |
| Merch control tower | `backend/app/modules/merch/merch_control_tower_service.py` | Rules |
| Merch alert rules (about 15, including TNA overdue, wastage vs BOM, trade LC expiry, shipment delayed, BTB maturity due/overdue, BTB utilisation risk, CM overrun) | `backend/app/modules/merch/alert_rules.py:RULE_REGISTRY` | Rules |
| MRP and planned orders | `backend/app/modules/inventory/mrp_engine_service.py` | Rules |
| Reorder suggestions | `backend/app/modules/inventory/reorder_service.py` | Rules |
| Stock aging, ABC, EOQ | `inventory/stock_aging_service.py`, `abc_analysis_service`, `eoq_service` | Rules / Stat |
| Defect, line balance, maintenance heuristics | `backend/app/modules/production/predictive_heuristic_service.py` | Heur |
| Cash scenarios, runway, fund flow | `finance/enhanced_cash_flow_service.py`, `finance/fund_flow_service.py` | Rules / Stat |
| LC exposure and BTB maturity ladder | `backend/app/modules/finance/exposure_service.py` | Rules |
| Party aging AR/AP | `backend/app/modules/finance/party_ledger_service.py` | Rules |
| Finance forecast, anomalies, HR AI | `ai_tool/finance_forecast_service.py`, `ai_tool/anomaly.py`, `ai_tool/ai_*_service.py` | Heur + LLM text |

---

## 1. Merchandising intelligence

**Data present:** `inquiries`, `quotations`, `orders` (pipeline timestamps such as `pi_issued_at`, `payment_received_at`), `garment_styles`, costing tables (`backend/app/models/costing.py`), `boms` / `bom_items`, `production_material_issues`, `wastage_transactions`, `wastage_order_summaries`, `followup_action_templates`, `order_followup_actions`, sample tables (`backend/app/models/merch.py`).

| Opportunity | Data available? | Integrations needed | Measurable benefit | Difficulty | Best method |
|---|---|---|---|---|---|
| AI-assisted costing | Yes - quotations + costing lines + peer history | Recent buy prices from PO/GRN via `costing_variance_service` | Quote cycle time; margin variance quote vs actual | L-M | Stat + rules; LLM to explain |
| Fabric consumption estimation | Yes - BOM consumption, marker `fabric_consumption_per_pcs`, PMI `actual_issue_qty`, wastage summaries | Cutting -> PMI -> wastage rebuild | Fabric over-issue rate; consumption error vs actual | M | Rules; ML only after 50+ closed styles |
| Style profitability | Mostly - quote costs, variance, `cm_cost_actuals`, invoices, receipts | Cost-centre posting discipline on vouchers | Margin per style vs quoted | M | SQL roll-ups |
| Order risk prediction | Yes - pipeline timestamps, TNA delays, material readiness, hourly vs plan | Reuse `anomaly.py` order delay + control tower | Late shipment rate; alert precision | L-M | Weighted heuristic |
| Buyer performance | Partial - orders/quotes per customer, TNA rejections, receipts | **Missing:** payment terms, claims, credit limit on `customers` | DSO by buyer; claim rate | M | SQL scorecard |
| Automatic TNA generation | Yes - templates with `default_days_before_delivery` | Event sync (`tna_event_sync` flag) | Setup time; template adoption | L | Rules (LLM optional for custom milestones) |
| Shipment delay forecasting | Partial - delivery date, TNA lag, line plan qty, `export_cases` dates, `shipments.etd/eta` | Completion forecast (section 2) | Forecast error in days; early-warning lead time | M | Stat (remaining qty / recent output) |

**Data gaps:** `customers` lacks payment terms days, credit limit and claim counters. `shipments` lacks actual sail and arrival timestamps.

---

## 2. Production intelligence

**Data present:** `sewing_lines`, `department_machines`, `sewing_line_style_configs` (planned/completed qty, SMV), `hourly_production_entries` (target/good/reject by line and hour), `operation_bulletins`, `line_balance_runs`, `marker_plans`, `lay_plans`, `cut_tickets`, `cutting_bundles`, `production_qc_checks`, `line_crew_daily`, `worker_skills`, `mfg_downtime_events`, NCR/CAPA (`backend/app/models/production.py` and manufacturing models).

| Opportunity | Data available? | Integrations needed | Measurable benefit | Difficulty | Best method |
|---|---|---|---|---|---|
| Efficiency prediction | Yes - hourly good vs target, style target efficiency, SMV | Present count from `line_crew_daily` | Daily target accuracy (MAE) | L-M | EWMA on hourly data |
| Line-loading optimisation | Yes - line configs, reservations, planning pipeline | Factory calendar, shifts | Idle line hours; OT hours | M | Rules + constraint solver; LLM for narrative |
| Bottleneck identification | Yes - `line_balance_runs.bottleneck_cycle_time`, hourly by department, bundle backlog, downtime | Extend existing heuristics | Throughput gain on constraint | L | Rules |
| Smart production planning | Yes (existing Gemini planning) | Deterministic completion forecast as input | On-time completion rate | M | Rules + Stat; LLM explains |
| Operator productivity | **No** at piece level - hourly is line aggregate | Bundle scan per operator | - | H (capture first) | Defer |
| Machine utilisation | Partial - manual downtime, running machine count, no IoT | Downtime discipline; IoT later | Downtime minutes by reason | M / H | Rules |
| Completion forecasting | Yes - planned/completed qty, hourly output, calendar | Feed merch order risk and TNA | Forecast error (days); OTIF | M | Stat (qty left / recent output per hour) |

**Data gap:** no per-operator output table.

---

## 3. Inventory and procurement intelligence

**Data present:** `items` (reorder level, safety stock, lead time, ABC class, preferred vendor), `stock_movements`, stock balance snapshots, batches, `vendors`, `purchase_orders`, `goods_receiving`, `grn_quality_inspections`, `planned_orders` (`backend/app/models/inventory.py`).

| Opportunity | Data available? | Integrations needed | Measurable benefit | Difficulty | Best method |
|---|---|---|---|---|---|
| Raw material demand forecast | Yes for order-driven demand (open orders x BOM) | `mrp_engine_service.explode_bom_for_order` | Forecast vs actual issue | L | BOM + MRP rules (beats ML for made-to-order) |
| Stock shortage prediction | Yes - MRP projected balance, reservations, open POs, `purchase_tools.suggest_orders_with_shortage` | Production start dates and TNA fabric-in milestones | Line stoppages from material; shortage alert lead time | L-M | Rules |
| Excess and dead stock | Yes - `stock_aging_service`, movements, ABC | Optional write-off voucher draft | Value of aged stock released | L | Rules (age bucket + no open demand) |
| Automated purchase recommendations | Yes - `reorder_suggestions`, EOQ, planned orders | Vendor lead time; BTB LC headroom (`exposure_service`) | PO cycle time; emergency buys | L / M | Rules |
| Supplier performance prediction | Partial - PO `expected_date` vs GRN date, GRN QC, price history | Scorecard query; optional nightly roll-up table | On-time delivery %; QC fail % | M | SQL scorecard |
| Material requirement optimisation | Yes - lot sizing, safety stock, `apply_lot_sizing` | Financing / BTB utilisation | Inventory days; expedite count | M | Rules + EOQ |

---

## 4. Financial intelligence

**Data present:** `vouchers`, `voucher_lines`, chart of accounts, cost centres, budgets, `cash_forecast_scenarios`, bank accounts, payment runs, `master_contracts`, `export_cases`, proforma invoices, `commercial_invoices` with receipt allocations, `btb_lcs`, `btb_maturity_tranches`, `trade_cases`, party ledger, `outstanding_bills`, `vendor_bills`, FX receipts (`backend/app/models/finance.py` and trade/commercial models).

| Opportunity | Data available? | Integrations needed | Measurable benefit | Difficulty | Best method |
|---|---|---|---|---|---|
| Cash-flow forecasting | Yes - voucher history, scenarios, invoice due dates, vendor bills, BTB tranches, payroll | Auto-seed scenario lines from open AR/AP + BTB ladder | Monthly net cash MAE; liquidity miss count | M | Rules + monthly averages; LLM narrative only |
| Export LC profitability | Yes if cost centres are used | Enforce cost centre on LC vouchers | Margin per LC vs quoted | M (process discipline) | SQL |
| BTB LC maturity risk alerts | Yes - `btb_maturity_tranches`, `exposure_service.build_maturity_ladder`, bank balances. A date-only alert already exists (`alert_rules.py:rule_btb_lc_maturity_due_or_overdue`) | Expected export realisation inflows; add cash coverage comparison | Maturities covered on time; forced-funding events | L-M | Rules |
| Shipment-to-payment forecast | Partial - ship dates, invoices, receipts; PI payment terms are free text | Structured payment terms | Days error on expected receipt | M | Buyer median DSO |
| Working-capital planning | Yes - inventory valuation, AR/AP aging, BTB facility, fund flow | Dashboard KPI | Cash conversion cycle | L-M | SQL ratios (`ratio_analysis_service`) |
| Cost variance / abnormal expense | Yes - costing variance, CM actuals, wastage, voucher duplicate hash, anomaly module | Unified alert centre | Leak value caught | L | Rules / thresholds |
| Receivable and payable risk | Yes - party aging, outstanding bills | Buyer and vendor scorecards | Overdue AR %; late-payment penalties avoided | L | Aging rules |

**Data gaps:** payment terms are free text on proforma invoices; no `expected_payment_date` on commercial invoices.

---

## 5. HR and operational intelligence

**Data present:** `hr_employees`, shifts, rosters, attendance entries (late and OT minutes), OT rules, payroll runs and lines, performance cycles, `worker_skills`, crew daily/templates (`backend/app/models/hr*.py`, production crew models).

| Opportunity | Data available? | Integrations needed | Measurable benefit | Difficulty | Best method |
|---|---|---|---|---|---|
| Workforce planning per line | Yes - crew templates, present vs planned, line loading | Attendance roster to crew sheet | Unfilled critical operations at shift start | M | Rules (planned minus present by role) |
| Attendance trends | Yes - `ai_attendance_analysis_service` exists | Department/section filters | Absenteeism rate trend | L | Stat |
| Overtime optimisation | Yes - OT entries + completion forecast | Completion forecast (section 2) | OT cost per piece; OT hours avoided | M | Rules (needed output vs OT cost) |
| Productivity recommendations | Partial - line level yes, individual no | IE bulletins + QC defect mix | Reject rate on coached lines | L / H | Heuristic |
| Skills-based operator allocation | Schema yes (`worker_skills` to operations library), data usually sparse | Crew sheet assignment UX | Changeover time; first-pass quality | M | Rule matching |

---

## 6. Data not captured today (blockers)

| Missing data | Blocks | Suggested capture |
|---|---|---|
| Operator piece/bundle completion | Operator productivity, incentives | Bundle scan events |
| Machine runtime / IoT | True utilisation, predictive maintenance | Downtime reason discipline first |
| Structured payment terms, expected payment date | Accurate shipment-to-cash | Enum + days on PI/CI |
| Shipment actual departure/arrival | Carrier delay forecasting | Date fields on `shipments` |
| Buyer credit and claim history | Buyer risk | Fields or claims register |
| Persisted vendor OTD/QC scores | Fast supplier ranking | Optional nightly roll-up |
| Outcome labels for predictions | Accuracy measurement for any model | Store prediction + actual outcome (see doc 05) |

---

## 7. Shortlist carried into the roadmap

These rank highest on value times data readiness, and all can be built with rules or simple statistics:

1. Unified order-risk score and TNA delay heatmap
2. Production completion and shipment delay forecast
3. Material shortage alerts tied to production start
4. BTB LC maturity versus cash coverage alert
5. Dead-stock and aging action list
6. Cost-variance surfacing and alerts
7. Supplier OTD/QC scorecard
8. Buyer DSO scorecard (needs payment-term fields)
9. Crew gap and overtime optimiser
10. Fabric consumption closed loop (quote -> BOM -> issue -> wastage)

Scoring and sequencing are in [08-prioritized-development-roadmap.md](08-prioritized-development-roadmap.md).
