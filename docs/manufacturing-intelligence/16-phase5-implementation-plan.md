# 16 - Phase 5 implementation plan (advanced planning)

**Mode and status**
- Mode: CRITICAL. The plan touches planning writes (only through the existing plan-revision approval flow) and reads money for the finance-constrained scenario.
- Tier: AUTO (inherited model). Author: architect (Auto), 2026-11-13.
- Owner instruction: "continue all phases; use the industry-recommended choice". Every open question is decided in section 3, choosing the most conservative safe option.
- Next gates: a `plan-auditor` verdict, then build approval. The final diff gets `security-auditor-premium` (the one automatic Premium step).

**Not verified** (read-only agent, no shell):
- `git status`.
- The alembic head at runtime. The repo files end at `301_ai_agent_decisions_recommendation.py`; Phase 5 adds no migration.
- Test runs.
- The status values of master sales contracts / export LCs, used in section 4.6 (UNVERIFIED; the build must check them).

## 1. Goal and non-goals

**Goal** (doc 11:58-62, decisions in doc 11:115-117):
- **Forward-plan engine.** One read-only engine with a horizon parameter of 90 / 120 / 150 / 180 days and weekly + monthly buckets.
- **Demand layers.** Confirmed, tentative, probability-weighted and forecast demand. They are kept separate and never counted twice.
- **Scenarios.** Base, optimistic, conservative, capacity-constrained and finance-constrained. Each is evaluated in memory.
- **Scheduler.** A deterministic, bounded, explainable greedy scheduler that produces a **proposal only**.
- **Conversion.** A proposal becomes real only as a PROPOSED plan revision via `plan_revision_service.propose`. The approver then applies it through the existing approve flow: four-eyes and `lock_version` checks.
- **Frozen horizon.** 14 days; the scheduler never touches it.
- **Objective order.** On-time ex-factory > fewer style changeovers > utilisation > overtime cost.

**Non-goals:**
- No change to Phase 1-4 outputs; new endpoints only.
- No OR-Tools / CP-SAT now (trigger criteria in D27).
- No snapshots, cache tables or saved scenarios (D25, D26).
- No migration.
- No automatic writes: no Celery job writes plans, and the scheduler never sets FIRM_BOOKED.
- No splitting an order across lines (D20).
- No scheduling of tentative bookings (they stay in their own table).
- No subcontract capacity.
- No AI or LLM arithmetic or wording in Phase 5.
- Nothing is edited under `finance/**` or in the Phase 3 / 4 services; only additive public wrappers are added.

## 2. Reuse table (evidence)

| Need | Reuse | Evidence |
|---|---|---|
| Flag guards (404 when off) | `require_mfg_intelligence_enabled`, `require_integrated_enabled`, `predictive_on` | `mfg_intelligence/flags.py:20-23,44-48,86-101` |
| Per line-day capacity, scenario rows, tentative SOFT load, assignments | `compute_capacity(..., scenario, include_tentative, integrated_planning, today)` | `capacity_service.py:596-617,620-717` |
| Pure day calculation (no DB) | `compute_day_capacity`: UNKNOWN on missing input, practical = operator_minutes × E | `capacity_service.py:398-416,470-488` |
| Limits | `MAX_LINES=500`, `MAX_PLAN_ROWS=5000`, `MAX_WINDOW_DAYS=180` | `capacity_service.py:54`, `line_loading_service.py:40`, `calendar_helpers.py:20` |
| Load classes and spreading | `demand_class`, `DayLoad`, `LoadedRow.allocation`, `fetch_live_plan_rows(scenario=)` | `line_loading_service.py:45-53,61-83,95-141` |
| What-if rows (never ORM) | `ScenarioRow`, `TentativeRow`, `Scenario`, `apply_to_rows` | `scenario.py:24-45,48-75,78-92,99-138` |
| Before / after impact (≤ 50 orders / items) | `compute_scenario_impact` | `impact_service.py:26-28,47-57` |
| Tentative dedupe (order > quotation > inquiry) and weighting | `fetch_tentative_rows`, `evaluate_bookings`; weighted = minutes × confidence | `tentative_demand_service.py:1-15,87-147,154-205,219-222` |
| Confirmed demand rule | `CONFIRMED_ORDER_STATUSES`, `confirmed_status_clause` | `confirmed_demand.py:12-21` |
| Ex-factory date, quantity, family | `Order.delivery_date`, `quantity`; `GarmentStyle.product_type`; `family_of` | `models/merch.py:240-243,296`; `empirical_efficiency_service.py:76` |
| SMV hierarchy | `resolve_smv_for_rows` (also with synthetic rows, as in `list_tentative_demand`) | `smv_resolver.py:42`; `tentative_demand_service.py:284-290` |
| Post-sewing lead days | `external_stages_for_orders`, `open_post_sewing_lead_days` | `route_stage_service.py:49,76-79` |
| Efficiency P50 / P80 / P90 | `load_efficiency_history`, `EfficiencyHistory.estimate`, `spread_ratios` (r_q clamped 0.5-1.5) | `empirical_efficiency_service.py:120-129,136-199,232-249`; `delivery_forecast_service.py:83-84,154-167` |
| Fixed bands when there is no history | `OPTIMISTIC_FACTOR=1.10`, `PESSIMISTIC_FACTOR=0.85` | `delivery_service.py:45-46` |
| Material-ready date per order | `_material_forecast` (Phase 4, private; needs a public wrapper, section 6) | `delivery_forecast_service.py:264-289,407-415` |
| Weekly cash, net cash, headroom | `build_cash_requirement` (7-day bins, `weeks`, `financing_gap`, `facility_headroom`), `nth_working_day_after` | `cash_requirement_service.py:1-51,108-109,184,1224-1243,1246-1255,1312-1376` |
| Finance gate (every RBAC mode) | `assert_mfg_finance_view` | `finance_gate.py:25-41`; router dependencies `finance_router.py:64-70` |
| CPM and quotation budget | `compute_cpm`, `load_order_money_context`, `resolve_budget` | `cpm_service.py:105`; `revenue_resolver.py:116,286` |
| The only plan write path | `RevisionItemIn`, `validate_items` (≤ 50 items, CREATE defaults DRAFT / efficiency 65 / operators 0), `propose` (request_id idempotency, payload hash, audit), `approve_and_apply` (four-eyes, lock_version) | `plan_revision_service.py:1-23,76-85,102-119,241-282,474-555,574-583` |
| Revision columns | `title` String(200), `reason` Text, `request_id` String(64) | `models/mfg_planning.py:103-105` |
| Planning router style | Prefix `/mfg-intelligence`, router-level `production.planning.read`, `_WRITE`, `_APPROVE`, `_guard` | `mfg_planning/planning_router.py:74-90,368-389` |
| Planning settings (JSON, no migration) | `PHASE3_DAY_KEYS` pattern, `update_planning_settings(phase3=...)` | `planning_settings_service.py:1-15,35-41,82-108,120-176` |
| No line capability master exists | `SewingLine` has no product / skill column | `models/production.py:107-125` (grep "capabilit" in models: none) |
| Lock version on plan rows | trigger-bumped `lock_version` | `models/production.py:385-386` |
| Settings switch guards | `_MFG_GUARDED`, `_check_mfg_planning_flags` | `settings/router.py:167-218` |
| Statement timeout without Python cancel | `set_config('statement_timeout', ..., true)` | `ai_tool/agent/loop.py:187-200` |
| Heavy-route rate limit | `rate_limit_dependency("heavy")` | `ai_tool/guardrails.py:54` |
| Tenant business date | `today_local(tenant)` | `common/business_date.py:76` |
| BD working hours (overtime cap) | 8 h/day, 48 h/week, 60 h/week with OT | `hr_localization/bd_rmg_catalog.py:193-195` |
| Read-only guard and route inventory tests | source scan + SQL listener; prefix → key map | `tests/test_mfg_intelligence_read_only.py:21-34`; `tests/test_route_permission_inventory.py:71-91` |
| Frontend tabs and deep links | `MfgTabId`, `visibleTabs`, `parseTabParam`, section render | `phase2/phase2Logic.ts:10,37-49`; `phase4/phase4Logic.ts:41-55`; `ManufacturingIntelligenceSection.tsx:83-92,276` |

## 3. Decisions (industry standard, owner instruction 2026-11-13)

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Flags | `mfg_advanced_planning_v1`: strict true, default OFF, never in `DEFAULT_ON_FEATURE_FLAGS`, needs `manufacturing_intelligence_v1` (Settings guard). Scheduler also needs `mfg_integrated_planning_v1`. Finance scenario also needs `mfg_financial_readiness_v1` plus the finance gate. Empirical efficiency needs `mfg_predictive_intelligence_v1`. `mfg_optimization_v1` (doc 09:83) stays reserved for CP-SAT. | Same pattern as Phases 2-4; least privilege; each dependency is explicit |
| D2 | Horizon | Enum 90 / 120 / 150 / 180 (default 90); always starts at the tenant business date | One engine with a parameter (doc 11:60); fits `MAX_WINDOW_DAYS` |
| D3 | Buckets | Weekly = 7-day bins from the start date (the same bins as Phase 3); monthly = calendar months clipped to the horizon. Month totals = sum of days, never sum of weeks. | Finance weeks line up; no rounding drift |
| D4 | Confirmed layer | Confirmed orders (owner rule) split into **planned** (load of their live plan rows, FIRM and SOFT shown separately) and **unplanned** = max(0, order qty − Σ planned_qty of the order's non-cancelled rows, COMPLETED included) × SMV | Every piece is counted once: either on a row or as unplanned |
| D5 | Unplanned placement | Lumped into the bucket of need-by = `delivery_date − open post-sewing lead days` (integrated planning on, else 0, reason `POST_SEWING_NOT_APPLIED`). Need-by before today → first bucket, `OVERDUE_UNPLANNED`. No delivery date → undated list. | Rough-cut capacity planning lead-time offset; the scheduler does the finite detail |
| D6 | Other booked load | Rows of unconfirmed orders = `UNCONFIRMED_ORDER_ROWS`; rows without an order = `UNLINKED_ROWS`. Both are separate layers counted as booked load. DRAFT rows are excluded (count only). | They occupy lines (doc 04:78-85); DRAFT is scenario only |
| D7 | Tentative layers | `TENTATIVE_FULL` = counted bookings (Phase 2 dedupe); `TENTATIVE_WEIGHTED` = full × confidence (two views of the same rows, never added together). Inquiries / quotations without a booking are not demand (count shown only). | No line or date means no load; avoids double counting |
| D8 | Forecast layer | Seasonal naive: forecast(month m, family) = actual sewing minutes of month m−12 (orders not CANCELLED / DRAFT, by ex-factory month, qty × SMV). Needs ≥ 12 complete months of history and ≥ 6 months with orders, else `UNAVAILABLE / INSUFFICIENT_HISTORY`. Family level only (no buyer). No trend. | Standard baseline for sparse B2B demand; conservative |
| D9 | Forecast consumption | Shown residual = max(0, forecast − confirmed(m, fam) − tentative_full(m, fam)); the residual is never part of "confirmed". Unknown-SMV orders are left out; coverage % is shown. | Industry forecast consumption; no double count |
| D10 | Scenario presets | BASE: confirmed + booked + tentative weighted, efficiency P50. OPTIMISTIC: BASE demand, efficiency q 0.20. CONSERVATIVE: confirmed + booked + tentative full + forecast residual, efficiency P80. CAPACITY_CONSTRAINED: BASE, finite by priority (4.5). FINANCE_CONSTRAINED: CAPACITY_CONSTRAINED, then the cash cut (4.6). Custom = any preset + parameters (D11). | Base / upside / downside S&OP practice, explicit labels |
| D11 | Parameters | `efficiency_basis` PLAN / P50 / Q20 / P80 / P90; `overtime_pct` 0-25; `absence_pct` 0-30 (default 0); `extra_operator_pct` −30..+30; `virtual_lines` 0-5; `material_delay_days` 0-60; `btb_delay_days` 0-60. Out of range → 422. | OT cap = 12 h / 48 h per week (s.102(2)); bounded what-ifs |
| D12 | Efficiency basis | P-bases = Phase 4 blended estimate (line, family ALL) × r_q from `spread_ratios(series, k=5)`. Predictive off or short history → PLAN × 1.10 (Q20) / × 0.85 (P80, P90), labelled `FIXED_BANDS`. P-bases use plan-basis operator minutes (`integrated_planning=False`); PLAN uses the integrated flag as Phase 1/2 do. | Same definition as the measurement (doc 15 §17.1); one k keeps weeks and months consistent |
| D13 | Absence | Default 0 in every preset, because empirical efficiency already includes absence (doc 15 §17.1); explicit what-if only | Avoids double de-rating (doc 11 risk R7) |
| D14 | Frozen horizon | `frozen_end = today + frozen_horizon_days − 1`, default 14, setting 14-60 (can only widen). No proposal creates or moves load on days ≤ frozen_end. Rows starting ≤ frozen_end, IN_PROGRESS, or with completed_qty > 0 are fixed. | Owner decision 2026-11-13; firm zone |
| D15 | What the scheduler may move | Order-linked SOFT_BOOKED / DRAFT rows of confirmed orders starting after frozen_end. FIRM_BOOKED only when `move_firm=true` (default false). Plus unplanned confirmed quantity (CREATE). Never: tentative bookings, unconfirmed or unlinked rows. | Firm planned orders are not auto-rescheduled (MRP practice) |
| D16 | Created row status | CREATE as SOFT_BOOKED; UPDATE never changes status. FIRM only by a later manual revision. | Most conservative; soft never reduces firm availability (doc 04:83) |
| D17 | Priority (job order) | Key = (need-by date, slack, order_code, id); slack = need-by − earliest start − single-line duration estimate | EDD with slack is the standard due-date heuristic |
| D18 | Line choice score | Lexicographic tuple: (lateness days, changeover rank, idle gap days, overtime minutes, line_code, line id). Changeover rank: same style 0, same family 1, other / new setup 2, family never run on the line 3. | Exactly the owner's objective order; no invented weights; explainable |
| D19 | Changeover loss | First production day of a rank ≥ 1 placement loses `changeover_loss_pct` (setting 0-100, default 50) of that day's practical minutes; rank 1 loses half of that. Learning curve L stays 1. | Common sewing rule of thumb (about half a day lost per style change); configurable, labelled |
| D20 | Split | One order goes on one line; no line meets need-by → earliest-finish line, flag `LATE`, reason `SPLIT_NOT_EVALUATED` | Keeps v1 simple and deterministic |
| D21 | Capability | No new master. "Proven family" = the line has a plan row or Phase 4 sample of that family in 365 days; unproven lines get rank 3 (soft). | No data model exists; soft preference, no new rule invented |
| D22 | Bounds | ≤ 100 jobs (by D17 key), ≤ 60 candidate lines (more → 422, use `factory_unit`), ≤ 180 days. Material dates for ≤ 100 orders; extra jobs are `UNSCHEDULED: JOB_LIMIT`. | Predictable latency |
| D23 | Material gate | earliest = max(frozen_end + 1, material_ready_q + material_delay + (btb_delay when a needed PO line is BTB-linked)). q = 0.5 for BASE / OPTIMISTIC, 0.8 for CONSERVATIVE. Lateness is applied only when predictive is on. Unknown → not limiting, warning `MATERIAL_DATE_UNKNOWN`. | Owner rule: booking before materials is allowed with a warning |
| D24 | Proposal binding | Response carries `proposal_hash` = sha256 over canonical inputs (parameters, today, frozen_end, row ids + lock_versions, job order qty / dates / status, settings) + items. Convert re-runs the engine and requires an equal hash, else 409 `PROPOSAL_STALE`. | Server-side truth; the client cannot inject items |
| D25 | Saved scenarios | Not persisted. Parameters are kept in browser storage per tenant + user (`p7_mfg_scenario:<tenant>`). Trigger to persist: owner asks to share or audit scenarios → table + RLS in a new migration. | Doc 11: persist only after measured need |
| D26 | Snapshots / cache | None. Trigger: p95 forward-plan latency > 5 s over 7 days in logs → Redis cache 1-5 min keyed by tenant + permission scope + params (doc 09 §8) first, snapshots table only after that | Doc 09:99, doc 11:62 |
| D27 | CP-SAT | Not added. Trigger (all must hold): (a) a benchmark of ≥ 5 anonymised tenant instances shows the heuristic's total tardiness ≥ 10 % above a CP-SAT 10 s solution; (b) owner approval; (c) lazy import from `requirements-ai.txt`; (d) the same proposal / convert contract under flag `mfg_optimization_v1` | Benchmarks first (doc 11:62) |
| D28 | Finance financing | Confirmed financing = Phase 3 `facility_headroom` (active facility available balance) + BTB deferral only for orders whose sales contract / LC is opened or accepted. Undrawn BTB limits are not counted. | Owner decision doc 11:113-114; conservative |
| D29 | Finance cut | Confirmed demand is never cut (a contract), only reported as `CONFIRMED_FINANCING_GAP`. Forecast is never funded (all cut, `FORECAST_NOT_FUNDED`). Tentative is cut in reverse priority (lowest confidence, latest start, highest id) until every week is ≥ 0. Unknown cash need → cut (`CASH_NEED_UNKNOWN`). | Finance-constrained S&OP cuts uncommitted demand only |
| D30 | Money visibility | Only the finance-constrained route returns money, behind the finance gate. Planners without the gate get 403 on that route, and other routes show no money. | Phase 3 rule (finance_gate.py:1-8) |
| D31 | Timeouts | Heavy GETs: `set_config('statement_timeout','20s', true)` at the start; scheduler iteration cap (deterministic, never wall clock); `rate_limit_dependency("heavy")` | Fail closed without breaking determinism |
| D32 | AI | No LLM, no agent tools in Phase 5; explanations are rule text from reason codes | No AI arithmetic; smallest surface |

## 4. Formulas and missing-data behaviour (Decimal, 4 dp, ROUND_HALF_UP; minutes = SMV minutes)

4.1 **Bucket capacity**
- Per line-day under scenario s: `cap_s(l,d) = theoretical(l,d) × (1 + ot%) × (1 − abs%) × (1 + extra_ops%) × eff_s(l)`.
  - `theoretical` = `DayCap.theoretical_minutes` from one `compute_capacity` call over the horizon.
  - For PLAN basis, `eff_s` = the Phase 1 efficiency, so the value equals `practical_minutes` × the factors.
  - Overtime applies on working days only.
- Virtual line v (D11) = per working day, the median `cap_s` of real lines with known values (`VIRTUAL`).
- `Bucket capacity = Σ known cap_s`. The count of UNKNOWN line-days and their reasons is reported; the bucket is PARTIAL if there are any. UNKNOWN is never filled, CLOSED days are 0, and empirical efficiency cannot fill an UNKNOWN day (`theoretical` is null when any input is missing, capacity_service.py:470-484).

4.2 **Demand per bucket**
- Each layer (D4-D9) is summed separately. Booked layers come from `LoadedRow.allocation` (tentative rows are recognised by `is_tentative`).
- `Load_s = Σ layers selected by s`.
- `Gap_s = capacity − load`; utilisation % = load / capacity (null when capacity is 0 or the bucket is PARTIAL).
- Unknown-SMV rows / orders: counted in `unresolved`, never as zero.

4.3 **Tentative.** `weighted = qty × SMV × confidence / 100`. A converted / superseded booking is not counted (Phase 2 rule).

4.4 **Forecast.**
- `F(m,fam) = A(m−12, fam)`. The residual is as in D9.
- The weekly view shows the residual pro-rated by the working days of the week inside month m (calendar).
- History query: one aggregate (month, style) with ≤ 24 months, capped at 20,000 groups with a truncation notice.

4.5 **Capacity-constrained**
- Booked rows stay in their buckets; an overload there is reported as `BOOKED_OVERLOAD`.
- Then, in order, admit: unplanned confirmed by need-by, then tentative weighted by confidence desc / start / id, then forecast residual.
- Each item fills remaining bucket capacity from its own bucket onward (forward carry only, no pre-build). Each item reports `buckets_pushed`; what is left at the horizon end is `DEFERRED_BEYOND_HORIZON`.

4.6 **Finance-constrained** (finance gate)
- Start from the Phase 3 result: `close_w` = weekly closing net cash and `H` = headroom (`build_cash_requirement`, called once).
- Add outflow `CONFIRMED_MATERIAL_NOT_ORDERED`, so confirmed orders' unplaced material is not missed:
  - amount = max(0, scaled budget material − procured), from `load_order_money_context` / `resolve_budget` and Phase 3 procured.
  - dated at the order's planned start (else need-by), or + `btb_usance_days` when its contract / LC is opened / accepted (D28, statuses UNVERIFIED).
- Each admitted tentative booking b needs:
  - **material** = quotation material + other cost × rate × booking qty / projected qty, at booking start;
  - **conversion** = booking minutes × CPM, on `nth_working_day_after(month_end, 7)`;
  - **no inflow** (no contract).
- Feasible when `∀w: close_w − cum_extra_w + H ≥ 0`. While it is not, cut per D29.
- Output: kept / cut lists (codes, minutes, cash need) and weekly position before / after.

4.7 **Scheduler free capacity**
- `free(l,d) = max(0, cap_s(l,d) − fixed_load(l,d))` for d > frozen_end, else 0.
- `fixed_load` = every live row not in the movable set (D15); tentative bookings are excluded (soft never blocks firm, doc 04:83).
- UNKNOWN day → 0 with `CAPACITY_UNKNOWN`.
- Placement of job j on line l: from the first working day ≥ `earliest_j`, consume free minutes day by day, minus the changeover loss (D19), until `M_j = qty × SMV` is covered.
  - Finish > horizon → not placeable on that line.
  - First pass without overtime. If late, a second pass with `overtime_pct` capacity is allowed; the OT minutes used are counted.
- `lateness = max(0, finish − need_by)` in calendar days. Choose the minimum of the D18 tuple, then subtract the consumption from `free`.
- Previous style on line l = the style of the latest-ending fixed row or placed job ending before the start.
- Iteration cap: ≤ 100 jobs × 60 lines × 2 passes; per-placement day steps ≤ horizon.

4.8 **Explanation** per job:
- the chosen line with its tuple;
- reason codes (`ON_TIME`, `LATE`, `SAME_STYLE`, `SAME_FAMILY`, `NEW_FAMILY_FOR_LINE`, `OVERTIME_USED`, `MATERIAL_LIMITED`, `FROZEN_LIMITED`);
- the top 2 alternatives with tuples and the deciding criterion.

Unscheduled jobs carry a reason: `SMV_UNKNOWN`, `QTY_UNKNOWN`, `NO_CAPACITY_IN_HORIZON`, `JOB_LIMIT`.

## 5. Data model

**No migration.** The alembic head stays 301 (files `300_mfg_predictive_tables.py`, `301_ai_agent_decisions_recommendation.py`).

New planning-settings JSON keys go in `tenant_production_settings.mfg_planning_config`. They are cleaned like the Phase 3 keys (planning_settings_service.py:35-41,100-102):
- `frozen_horizon_days` (14-60, default 14);
- `changeover_loss_pct` (0-100, default 50).

Older code ignores unknown keys (`_clean_config` copies only known keys). No new tables, therefore no RLS migration; revisions use the existing tables.

## 6. Services and files

Backend, read-only (`mfg_intelligence/`, covered by the read-only guard):
- `forward_plan_params.py`: presets, parameter validation, horizon enum.
- `demand_layers.py`: D4-D9 loaders (batched: orders 1, planned qty grouped 1, styles 1, SMV ≤ 3, stages 1).
- `forecast_demand_service.py`: D8 / D9.
- `forward_plan_service.py`: 4.1-4.5 and payloads.
- `finance_constrained_service.py`: 4.6. It calls `build_cash_requirement`, `compute_cpm`, `load_order_money_context`; no finance edits.
- `scheduler_service.py`: pure greedy engine over plain dataclasses (no DB), plus an async loader and `proposal_hash`.
- `advanced_planning_router.py`: GET routes.
- `advanced_planning_schemas.py`.
- Additive public wrapper `material_ready_dates(db, tenant, orders, today, q, apply_lateness)` in `delivery_forecast_service.py`, delegating to `_material_forecast` without changing Phase 4 output (contract test).

Backend, writes (`mfg_planning/`):
- `scheduler_router.py` (POST convert).
- `scheduler_convert.py`: re-run, hash check, frozen re-validation, build `RevisionItemIn` list, call `prs.propose`, extra audit `mfg_scheduler.convert`.

Edits:
- `common/tenant_feature_keys.py`: key + reader.
- `mfg_intelligence/flags.py`: `advanced_planning_on`, `require_advanced_planning_enabled`, `require_scheduler_enabled`.
- `settings/router.py`: `_MFG_GUARDED` entry.
- `production/planning_settings_service.py` + its PUT schema: a `phase5` dict.
- `main.py`: mount 2 routers.
- `tests/test_route_permission_inventory.py`: prefixes.

No worker and no Celery schedule.

## 7. API (prefix `/api/v1/mfg-intelligence`; tenant mismatch 403; flag off 404; dates ISO; minutes are 2-dp strings)

| Method / path | Permission | Flags | Notes |
|---|---|---|---|
| GET `/forward-plan?horizon_days&bucket=week\|month&factory_unit&scenario&<D11 params>` | `production.planning.read` (router level) + heavy rate limit | MI + advanced | Buckets: capacity, layers, load, gap, utilisation, PARTIAL / unknown counts, assumptions, notices |
| GET `/forward-plan/compare?scenarios=BASE,OPTIMISTIC,...` (≤ 4, no FINANCE_CONSTRAINED) | same | same | Loads once, applies parameter sets in memory |
| GET `/forward-plan/forecast-demand?horizon_days` | same | same | Availability, method, months used, coverage, residual by family |
| GET `/forward-plan/finance-constrained?horizon_days&factory_unit` | + route `finance.access` + `assert_mfg_finance_view` | + `mfg_financial_readiness_v1` | Money as 4-dp strings, kept / cut lists, weekly before / after, `CONFIRMED_FINANCING_GAP` |
| GET `/scheduler/preview?horizon_days&factory_unit&efficiency_basis&overtime_pct&move_firm&material_delay_days&btb_delay_days` | `production.planning.read` + heavy | MI + advanced + integrated | Jobs (placed / unscheduled), proposed items, KPIs before / after (late count, lateness days, changeovers, OT minutes), `proposal_hash`, `frozen_end` |
| POST `/scheduler/convert` body `{params, proposal_hash, job_ids[1..50], note (5-500), request_id (8-32)}` | `production.planning.write` | same | 201 new revision / 200 replay; 409 `PROPOSAL_STALE`; 422 frozen / limit / validation. `request_id` stored = `sch-<hash[:24]>-<client id>` (≤ 64); title `Scheduler proposal <hash[:12]>`. Approve / reject via the existing `/plan-revisions/{id}/approve` (`production.planning.approve`, four-eyes). |

`PUT /planning-settings` accepts `phase5: {frozen_horizon_days, changeover_loss_pct}` (existing approve permission, 422 out of range).

## 8. Frontend and tutorial

- One new tab, **Forward plan** (`MfgTabId` `"forward"`, alias `forward-plan` in `parseTabParam`). It appears when `readPhase5Flags` reports `advanced` strictly true.
- Sub-views:
  - **Capacity vs demand**: week / month toggle, stacked layers with legend, PARTIAL markers, assumptions.
  - **Scenarios**: preset picker, parameter drawer, compare table (≤ 4).
  - **Finance**: only when the cash flag is on and `can_view_finance`; otherwise not rendered.
  - **Scheduler**: only with integrated planning. Run preview, results table with one Actions menu per row (Why this line, Include / Exclude), and a "Proposal only — needs approval" banner.
  - **Create plan revision**: dialog with a note, ≤ 50 selected, `request_id` generated once per dialog. It then links to the Plan changes tab.
- Files:
  - `frontend/src/api/mfgAdvancedPlanning.ts`;
  - `hooks/useMfgAdvancedPlanning.ts`;
  - `components/control-tower/intelligence/phase5/{ForwardPlanTab, CapacityDemandView, ScenarioCompareView, FinanceConstrainedView, SchedulerView, ConvertProposalDialog}.tsx` + `phase5Logic.ts`;
  - edits to `phase2Logic.ts` (tab), `phase4Logic.ts` (TAB_IDS / alias), `ManufacturingIntelligenceSection.tsx`, `ConfigurationPage.tsx` (switch);
  - planning settings form fields.
- Tutorial: `mfg-intel-forward-plan` in `data/tutorials/sections/manufacturing.ts` (routes, layers, scenarios, frozen zone, approval path, `lastUpdated`), plus related links from `mfg-intel-plan-changes`.
- `AGENTS.md` gets a Phase 5 entry.

## 9. Security and privacy

- **Tenant isolation.**
  - Every query filters `tenant_id`.
  - Convert passes every row / order id through `validate_items` → `ensure_owned`; another tenant's id = 404.
  - `job_ids` resolve only against the server re-run.
  - `user.tenant_id != tenant.id` → 403.
- **RBAC.**
  - Read routes use `production.planning.read`; convert uses `.write`; approve stays `.approve` + four-eyes.
  - Money only through the finance gate in every RBAC mode.
  - No loosening; new prefixes are in the route inventory test.
- **Integrity.**
  - The scheduler and forward plan never write (read-only guard).
  - Convert writes only via `propose` (audited `mfg_plan_revision.propose` + `mfg_scheduler.convert`).
  - The approve path checks `lock_version` (409, nothing written).
  - Frozen horizon is enforced at three points: engine, convert re-validation against current rows, and the hash.
- **Privacy and money.** Family-level forecast (no buyer names); no employee data; money as Decimal strings; no secrets in logs. Logs carry tenant, endpoint, duration and counts only.
- **DB errors.** Read routes do not catch DB errors mid-request. Convert follows the `propose` pattern (no `safe_async_session_rollback` mid-request; the router commits once).

## 10. Tests (backend `docker compose exec backend pytest ...`; frontend `npm test`)

Fixtures extend `tests/mfg_intel_fixtures.py` and `tests/mfg_finance_fixtures.py`.

- **`tests/test_mfg_forward_plan.py`**
  - BASE + PLAN bucket capacity equals Σ `practical_minutes`.
  - Week / month consistency.
  - Horizon enum 422.
  - CLOSED = 0; UNKNOWN reported, not counted.
  - Constant query count for 5 vs 40 orders (`query_counting.py`).
  - 180 days × 30 lines within budget.
- **`tests/test_mfg_forward_plan_layers.py`** — no double counting:
  - planned + unplanned = order qty × SMV;
  - a converted booking counted only as confirmed;
  - an inquiry + quotation booking counted once;
  - weighted ≤ full and never summed with it;
  - forecast residual consumption;
  - forecast UNAVAILABLE under 12 months;
  - DRAFT excluded; unconfirmed / unlinked layers separate.
- **`tests/test_mfg_forward_plan_scenarios.py`**
  - Each parameter's effect.
  - OT > 25 → 422.
  - P50 / P80 from Phase 4 estimates; FIXED_BANDS when predictive is off.
  - Absence default 0.
  - Compare ≤ 4.
  - Capacity-constrained carry-forward order (confirmed before tentative before forecast).
- **`tests/test_mfg_finance_constrained.py`**
  - 403 for a planner in off / shadow / enforce; 404 flag off.
  - Lowest-confidence tentative cut first.
  - Forecast never funded; confirmed never cut, `CONFIRMED_FINANCING_GAP`.
  - Headroom used; unknown cash need cut; money strings.
- **`tests/test_mfg_scheduler.py`**
  - Frozen horizon never moved / loaded (seeded randomised fixtures).
  - FIRM untouched unless `move_firm`.
  - EDD order; lateness beats changeover; same-style grouping on ties; overtime only when needed.
  - Unproven family rank 3; UNKNOWN capacity skipped.
  - Limits and truncation notices.
  - Determinism: two runs give identical JSON + hash.
  - SQL listener: no INSERT / UPDATE / DELETE.
  - Explanations present.
- **`tests/test_mfg_scheduler_convert.py`**
  - After convert, `sewing_line_style_configs` are unchanged and the revision is PROPOSED.
  - Approve applies; four-eyes blocks the proposer.
  - Stale hash 409; row `lock_version` changed before approve → 409.
  - Same `request_id` → 200 same revision; same id with different `job_ids` → 409.
  - Cross-tenant ids 404; > 50 → 422; a row moved into the frozen zone → 422.
  - Read-only role → 403; integrated off → 404.
- **`tests/test_mfg_advanced_flag_off.py`**
  - All new routes 404 when off.
  - Phase 1-4 payloads byte-identical with the flag on vs off.
  - Settings guard needs MI.
  - Planning settings new keys validated.
  - Phase 4 forecast unchanged by the wrapper.
- **Extend** `test_mfg_intelligence_read_only.py` (new endpoints) and `test_route_permission_inventory.py`.
- **Frontend**
  - `phase5/phase5Logic.test.ts`: tab visibility, alias, parameter validation, bucket formatting, selection ≤ 50.
  - `phase5/MfgPhase5ForwardPlan.test.tsx`: layers rendered separately, finance view hidden without permission, convert dialog needs a note, proposal banner.

## 11. Acceptance criteria

| # | Criterion | Proved by |
|---|---|---|
| 1 | Flag off (any dependency) → new routes 404 and Phase 1-4 outputs identical | `test_mfg_advanced_flag_off.py` |
| 2 | One engine serves 90 / 120 / 150 / 180 with week and month buckets that reconcile | `test_mfg_forward_plan.py` |
| 3 | Each piece of demand appears in exactly one layer; weighted and forecast are never inside confirmed | `test_mfg_forward_plan_layers.py` |
| 4 | Missing inputs give UNKNOWN / PARTIAL, never a default | `test_mfg_forward_plan.py` |
| 5 | Scenario parameters change only capacity / demand as defined in 4.1-4.5; bounds give 422 | `test_mfg_forward_plan_scenarios.py` |
| 6 | Finance scenario: gate 403, never cuts confirmed, never funds forecast, weekly position ≥ 0 after cuts or a gap is reported | `test_mfg_finance_constrained.py` |
| 7 | The scheduler never places or moves load on or before frozen_end, and never touches FIRM by default | `test_mfg_scheduler.py` |
| 8 | Scheduler output is deterministic, bounded and explained | `test_mfg_scheduler.py` |
| 9 | No plan row changes until an approver approves the revision; approval keeps four-eyes and lock_version | `test_mfg_scheduler_convert.py` |
| 10 | Convert is idempotent per request_id and rejects stale proposals | `test_mfg_scheduler_convert.py` |
| 11 | Cross-tenant ids look "not found"; permission denial 403 | `test_mfg_scheduler_convert.py`, route inventory |
| 12 | Query count independent of order count; 180-day run within budget | `test_mfg_forward_plan.py` |
| 13 | UI shows the proposal-only banner, hides finance without permission; tutorial updated | frontend tests, `npm run check` (tutorial capture) |

## 12. Build runs (each ends green: focused + `tests/test_mfg_*.py`, `python -c "import app.main"`, frontend `npm run lint && npm test && npm run build`)

- **B1 — engine + scenarios.**
  - Flag + settings guard, planning settings keys.
  - `forward_plan_params`, `demand_layers`, `forecast_demand_service`, `forward_plan_service`, `finance_constrained_service`, the material wrapper, the read router.
  - Tests: sections 10.1-10.4, flag-off, read-only, route inventory.
- **B2 — scheduler + conversion.**
  - `scheduler_service`, `/scheduler/preview`, `mfg_planning/scheduler_convert.py` + router.
  - Tests: sections 10.5-10.6 + rerun of `test_mfg_plan_revision*` / four-eyes tests.
- **F — frontend.** Phase 5 tab and sub-views, Configuration switch, planning settings fields, tutorial `mfg-intel-forward-plan`, `AGENTS.md` entry; frontend tests.

Each run is reviewed by `qa-engineer`. The final diff gets `security-auditor-premium`.

## 13. Rollback and operational impact

- **Rollback.**
  - Switch `mfg_advanced_planning_v1` off (instant, per tenant). Then `git revert` the Phase 5 commits.
  - No `alembic downgrade` is needed.
  - Revisions already created by the scheduler are normal revisions: reject or cancel PROPOSED ones, and reverse APPLIED ones with a new revision.
  - Stored `phase5` settings keys are ignored by older code.
- **Operational impact.**
  - No env var, migration, restart step or downtime.
  - Blast radius: tenants that switch the flag on.
  - Load: heavy GETs are rate limited and statement-timeout bounded.
  - The finance scenario calls the Phase 3 cash builder once per request (several seconds possible on large tenants; logged).

## 14. Risks and open points

| Risk | Control |
|---|---|
| Unplanned demand lumped at need-by overloads a single week | Monthly view, label `UNPLANNED_AT_NEED_BY_BUCKET`; scheduler does the finite detail |
| Capacity for new rows uses the stored shift / operator pattern (line default, shared pool) | Stated assumption; `propose` recomputes the true impact before approval |
| Per-order material dates (≤ 100 orders) make many queries | Bounded by D22; measured in the performance test; cache only after D26 trigger |
| Contract / LC status values for "opened / accepted" are UNVERIFIED | Build verifies and allowlists them; unknown status = not financing (conservative) |
| `CONFIRMED_MATERIAL_NOT_ORDERED` is an estimate | Labelled ESTIMATED; only inside the finance scenario; Phase 3 numbers are not changed |
| Changeover default (50 %) is a rule of thumb | Setting, labelled assumption; it only ranks lines and costs capacity in proposals |
| No split or multi-line allocation | `SPLIT_NOT_EVALUATED` reason; candidate for CP-SAT / Phase 5.1 after benchmarks |
| Seasonal-naive forecast is noisy for new buyers / products | ≥ 12 months gate, family level, never in confirmed, excluded from BASE |
| A planner reads cut lists without finance rights | The route is behind the finance gate (403) |

## 15. Plan-auditor resolutions (binding; override sections 3-10 where they differ)

Owner instruction: industry-standard choices. Each item is binding for the build and the tests.

1. **Frozen fence at approval.** Add an additive check to `approve_and_apply`: when `rev.request_id` starts with `sch-`
   and any CREATE / UPDATE `after.start_date <= today_local(tenant) + frozen_horizon_days - 1`, return 409
   `PROPOSAL_ENTERED_FROZEN_ZONE` and write nothing. Manual revisions are unchanged. Tests: a stale scheduler
   revision approved after the fence moved → 409 with rows unchanged; a manual revision is unaffected.
2. **Demand layer identity** (per confirmed order, quantity terms):
   `order_qty = completed + remaining_on_live_rows + unplanned`, where
   `unplanned = max(0, order_qty − Σ planned_qty over FIRM / SOFT / IN_PROGRESS / COMPLETED rows)`. DRAFT rows are never
   planned and never load (count only, reason `DRAFT_ROWS_PRESENT`). Σ is over all dates
   (`fetch_order_plan_rows(include_completed=True)`), not the horizon. Over-planned = `OVER_PLANNED` (unplanned 0).
   Fix the test to `completed + remaining + unplanned = order qty` (× SMV for minutes).
3. **Remaining-work re-spread.** In the forward plan, every live row's remaining minutes are re-spread evenly over its
   working days from `max(start, today)` to its end. Rows ending before today with remaining > 0 go to the first bucket as
   layer `OVERDUE_PLANNED_BACKLOG`. Phase 1-4 readers are unchanged.
4. **Unplanned placement (RCCP lead-time offset).** Spread the unplanned minutes backward from need-by over
   `ceil(minutes / median line daily practical minutes)` working days, clipped at today (remainder in the first bucket,
   `OVERDUE_UNPLANNED`). No known capacity → lump at need-by with `UNPLANNED_AT_NEED_BY_BUCKET`. Need-by beyond the horizon
   → excluded and counted.
5. **Forecast.** History status set = not CANCELLED / DRAFT, by ex-factory month. Consumption uses the same status set
   plus counted tentative bookings (full quantity, by booking end month). Availability is per family: ≥ 12 complete
   months of tenant history and ≥ 6 months with orders for that family. Otherwise the family is `INSUFFICIENT_HISTORY`.
   The residual is labelled `FORECAST_AT_EXFACTORY_MONTH`.
6. **Capacity parameters.**
   - `absence_pct > 0` only with `efficiency_basis=PLAN`; with a P-basis → 422 `ABSENCE_ALREADY_IN_EMPIRICAL`.
   - Overtime minutes per line-day = `min(ot% × theoretical, operators × max(0, 600 − theoretical/operators))`, working
     days only.
   - `extra_operator_pct` scales theoretical only.
   - P-bases use `spread_ratios(series, k=SPREAD_MAX_K=20)`, which needs ≥ 29 samples; otherwise `FIXED_BANDS`.
   - At most 2 `compute_capacity` calls per request (plan basis and, when needed, integrated).
   - Efficiency is per line-day (`DayCap.efficiency_pct`), never per line.
7. **Scheduler scope (v1).**
   - Basis is PLAN only (P-bases → 422 on scheduler routes).
   - Movable = SOFT_BOOKED rows of confirmed orders starting after `frozen_end` with `completed_qty = 0`, plus unplanned
     remainders. FIRM rows are never moved; `move_firm` is removed. FIRM rows that would be late get the read-only
     message `FIRM_RESCHEDULE_SUGGESTED`.
   - DRAFT, unconfirmed and unlinked rows are fixed or ignored as in item 2. DRAFT rows are not part of `fixed_load`.
   - A job is either `row:<config_id>` (UPDATE `line_id`, `start_date`, `planned_end_date` only) or
     `order:<order_id>` (one CREATE). One item per job.
   - Free capacity comes from one `compute_capacity` call with a `Scenario` that removes every movable row.
   - Jobs beyond 100, SMV-unknown jobs and jobs after the 50th changed item stay where they are (their load stays fixed),
     with reasons `JOB_LIMIT`, `SMV_UNKNOWN` and `REVISION_ITEM_LIMIT`.
   - Candidate lines = active lines in `factory_unit` (≤ 60); otherwise 422.
   - Tentative bookings that a placement overlaps are reported as `TENTATIVE_DISPLACED` (never blocking).
8. **No overtime in convertible placements.** Placements use base capacity only. When a job is late, report
   `OVERTIME_WOULD_RECOVER` with the minutes needed (advisory). Rows carry no overtime, so overtime-based plans would show
   as OVERLOADED after approval.
9. **Phase 1 consistency check.** After a tentative placement, check that `remaining minutes / n working days` ≤ free
   capacity on every day of the span (even spread, as Phase 1 reads it). If not, extend the end date one working day at a
   time, bounded by the horizon. Changeover loss only lengthens the span.
   - CREATE items always send `target_efficiency_pct` = the `DayCap.efficiency_pct` used on the job's first day (2 dp)
     and leave out `shift_id` and `operator_count`. Operator count 0 means the line default (`capacity_service.py:240-245`).
   - UPDATE items never change efficiency, operators or shift; duration uses the row's own `target_efficiency_pct`.
   - Every item sends an explicit `planned_end_date`.
10. **Whole-proposal convert.** Remove `job_ids` from convert. "Exclude" in the UI re-runs the preview with
    `exclude_job_ids` (≤ 100), which pins those jobs at their current position. Convert submits the whole current proposal
    (≤ 50 items, guaranteed by item 7).
11. **Proposal hash.** `proposal_hash = sha256(canonical JSON {engine_version, params, today, frozen_end, settings used,
    every job result: id, action, line_id, start, end, qty, status, reasons})`. No raw input ids. `before_lock_version` in
    `propose` protects the rows at approval.
12. **Convert order and idempotency.**
    - `request_id` = `^[A-Za-z0-9_-]{8,32}$`; stored as `sch-<proposal_hash[:24]>-<client id>` (≤ 61 characters).
    - Step 1: look up the stored id. If it exists and its `reason` equals the note → 200 replay with no re-run; a
      different note → 409.
    - Step 2: re-run inside a SAVEPOINT with a local `statement_timeout` of 20 s, restoring the previous value afterwards
      (`loop.py:187-200` pattern).
    - Step 3: hash mismatch → 409 `PROPOSAL_STALE`; any item starting ≤ `frozen_end` → 422.
    - Step 4: `prs.propose(title="Scheduler proposal <hash[:12]>", reason=note)`, then audit `mfg_scheduler.convert`.
    - Apply `rate_limit_dependency("heavy")` to convert too.
13. **Read-route timeouts.** Heavy GETs set `statement_timeout` to 20 s (local to the transaction). On `QueryCanceled`:
    `safe_async_session_rollback(db)`, then 503 `FORWARD_PLAN_TIMEOUT`. Forward plan: ≤ 200 lines, otherwise 422 asking
    for `factory_unit`. Performance tests: forward plan at 180 days × 120 lines and scheduler at 100 jobs × 60 lines ×
    180 days (with material dates), each p95 < 8 s on local Docker. Record the numbers in the build report.
14. **Confirmed financing.**
    - "LC opened" = `is_lc_received_status(MasterContract.status)` (`common/master_contract_workflow.py`) and
      (`expiry_date` is null or ≥ the outflow date).
    - BTB deferral (`+ btb_usance_days`) only while `amount − btb_utilized_amount` (FX-converted; unknown → no
      deferral) covers the item.
    - Facility headroom H = Phase 3 `facility_headroom.amount` (memo; `unknown_by_currency` excluded).
15. **Finance cash per tentative booking.**
    - Cash = (quotation material + other) × rate × booking qty / projected qty, at the booking start date.
    - No conversion / CPM (payroll is already in the Phase 3 rows); label `CONVERSION_IN_PAYROLL`.
    - Whole bookings at full quantity (cash is binary), never confidence-weighted. Inquiry-only booking or unknown FX →
      `CASH_NEED_UNKNOWN` → cut.
    - `CONFIRMED_MATERIAL_NOT_ORDERED` comes from `cost_at_completion_service.load_batch` + `material_eac` (one source of
      truth, its own caps), labelled ESTIMATED.
    - The response shows three weekly lines: Phase 3 as is → + confirmed material → + kept tentative.
    - `build_cash_requirement` is called exactly once (test with a call counter).
16. **Capacity-constrained buckets.** Computed on weekly bins only; monthly = sum of days. Partial months carry
    `PARTIAL_MONTH`.
17. **Material wrapper.** `material_ready_dates(..., apply_lateness)` with `apply_lateness=False` passes a zero-lateness
    model (source NONE). Contract test: Phase 4 `forecast_deliveries` output is byte-identical before and after the wrapper.
18. **Settings and UI.** Add `frozen_horizon_days` and `changeover_loss_pct` to `_clean_config` (Phase 3 saves keep
    them). Browser storage key = `p7_mfg_scenario:<tenant_id>:<user_id>`. A notice reports unconfirmed orders that have no
    rows and are therefore not demand.
19. **Added tests.** Frozen check at approval (item 1); DRAFT not double-scheduled; overdue backlog layer; even-spread fit
    (no OVERLOADED day after applying a proposal in the fixture); pinned jobs beyond the cap keep their load; replay before
    re-run; 503 on a forced timeout; LC status allowlist and expiry; no CPM in tentative cash; P-basis + absence → 422;
    request_id format → 422; scheduler GET → 403 for a role without `production.planning.read`.
