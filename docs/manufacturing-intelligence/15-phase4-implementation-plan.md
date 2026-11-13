# 15 - Phase 4 implementation plan (predictive intelligence)

Mode: CRITICAL (statistics on tenant data, AI text, alerts, migration). Tier: AUTO (inherited model). Author: architect
(Auto), 2026-11-13. Status: owner instruction "continue all phases; use the industry-recommended choice for every
decision" - every open question is decided in section 3. Needs `plan-auditor` verdict, then build approval; the final
diff gets `security-auditor-premium` (one automatic Premium step). Not verified (read-only agent, no shell): `git status`,
alembic head at runtime (repo files end at `299_mfg_routes_style_smv.py`), test runs.

## 1. Goal and non-goals

Goal (doc 11 Phase 4 line): empirical line efficiency, supplier lateness percentiles, calibrated delivery P50 / P80 / P90
and on-time probability, anomaly detection, bottleneck alerts through the existing alert engine and governed AI agents,
recommendations with human decision + outcome tracking, LLM explanations of deterministic results, panel G, AI agent
read tools. All behind strict default-OFF flags; flag off = zero behaviour change.

Non-goals: no change to Phase 1-3 outputs (new endpoints only); no Monte Carlo; no automatic recalibration (shown only);
no new alert system; no writes to plans / POs / payroll / financing / shipments; no money in Phase 4 (no value weight);
no per-employee analytics; no cross-tenant pooling (every fallback stays inside the tenant); no Phase 5 optimiser.

## 2. Reuse table (evidence)

| Need | Reuse | Evidence |
|---|---|---|
| Flag guards (404 when off) | `require_mfg_intelligence_enabled` pattern | `mfg_intelligence/flags.py:18-81`, keys `tenant_feature_keys.py:190-201,310-339` |
| Router style (permission dependency, tenant check, logging) | MI router | `mfg_intelligence/router.py:48-52,55-57,67-74` |
| Inventory detail gate (enforce mode) | `_may_see_material_detail` | `router.py:80-85` |
| Read-only guard | source scan + SQL listener | `tests/test_mfg_intelligence_read_only.py:21-34,70-77,178-186` |
| Available operator-minutes per line-day | `compute_capacity` / `DayCap.theoretical_minutes` (= operator_minutes) | `capacity_service.py:3-5,234,486-512,596` |
| SMV per plan row | `resolve_smv_for_rows` | `delivery_service.py:139-141` |
| Delivery start/rate/calendar/external stages | `predict_deliveries` building blocks | `delivery_service.py:85-211`, fixed bands `:45-46`, `MAX_ORDERS=200` `:48` |
| Sewing-only hourly output | `department_type = 'sewing'` filter | `cpm_service.py:48-52` (Phase 3 finding #9) |
| Hourly facts | `hourly_production_entries` (line, config, style, date, slot, good/reject) | `models/production.py:393-425` |
| Planned efficiency fallback | `sewing_line_style_configs.target_efficiency_pct` | `models/production.py:369` |
| Style family | `garment_styles.product_type` | `models/merch.py:296` |
| Material shortage per order | `compute_material` | `readiness_service.py:262` |
| Open PO ETA chain | `load_open_po_lines`, `resolve_eta`, `usable_received_qty` | `open_po_supply_service.py:17-20,105-109,183-205` |
| Promised / receipt dates | `purchase_orders.expected_date`, `vendor_id`; `goods_receivings.received_date`; `items.category_id` | `models/inventory.py:175-181,257,263`; `models/costing.py:129` |
| Actual ex-factory | `delivery_challans.delivery_date` + `delivery_challan_orders` | `models/inventory.py:676-699,716-723` |
| Alert upsert / dedupe / savepoint per rule | `run_rule`, `RULE_REGISTRY`, `DEFAULT_DEFINITIONS`, `_evidence_schema_v1` | `merch/alert_engine.py:82-188,236,247-248`; `merch/alert_rules.py:70-83,1042-1076` |
| Stale alert resolution pattern | `resolve_stale_production_cm_alerts_for_period` | `merch/alert_engine.py:28-56` |
| Exception agent + human confirm | `AGENTS`, `DETECTORS`, `_can_confirm` (`ai.agents.confirm` or admin/manager), re-detect on confirm, hidden keys | `governed_ai/detectors.py:23-31,47-70,306-315`; `governed_ai/router.py:48-57,83-88,126-141,236-256` |
| Decision storage | `ai_agent_decisions` (extend, doc 07 §4 / doc 09 §6) | `models/ai_agents.py:13-27`; `docs/.../09-technical-architecture.md:98` |
| LLM provider gating + usage | `generate_text_for_tenant` (writes usage + flush) | `common/gemini_client.py:146-216` |
| Redaction / clamp | `redact_pii_for_external_provider`, `clamp_text_for_llm` | `ai_tool/llm_provider/prompt_sanitizer.py:18,29` |
| Number guard for AI text | `validate_answer` + `FactRow` (public import, no edits) | `finance/ai_insights/validation.py:1-24,212` |
| AI agent tools | `AGENT_TOOLS`, `Gate`, `check_gate` | `ai_tool/agent/catalog.py:1-10,59-93,447,648`; test `tests/test_ai_agent_mode.py:176` |
| Daily job pattern | per-tenant transaction, `bind_session_tenant`, fail closed | `workers/mfg_planning_worker.py:35-73`; schedule `common/celery_app.py:47,50-92` |
| RLS migration pattern | `_enable_rls` / `_disable_rls` | `alembic/versions/297_mfg_booking_revisions.py:37-60` |
| Frontend tabs | `ManufacturingIntelligenceSection`, `visibleTabs` | `frontend/src/components/control-tower/intelligence/ManufacturingIntelligenceSection.tsx:57-80` |

Not reused: `production/efficiency_ai_service.py` (N+1 per line `:33`, `date.today()` `:17`, float `:40`, LLM-made
prediction `:45-51`) and `ai_tool/forecasting.py` adapters (`:10-17`, LLM-narrated legacy forecasts). Both stay unchanged.

## 3. Decisions (industry standard, owner instruction 2026-11-13)

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Flag names | `mfg_predictive_intelligence_v1` (all Phase 4) + `mfg_predictive_ai_text_v1` (LLM wording only); strict true, default OFF, both need `manufacturing_intelligence_v1`; never in `DEFAULT_ON_FEATURE_FLAGS` | Name already recorded in doc 09:82; separate kill switch for sending data to an external LLM |
| D2 | Engine order | Deterministic, then statistics, then LLM wording only; LLM never produces a number | Doc 07 §1; auditability |
| D3 | Efficiency metric | Daily efficiency = earned minutes / available operator-minutes (not pieces/hour as in doc 04:63) | Style-independent; single de-rate (doc 04 R7) |
| D4 | Efficiency estimator | Winsorise at median ± 3.5·1.4826·MAD, then EWMA α = 0.2 over last 90 calendar days (max 60 production days) | Robust to typos, follows trend |
| D5 | Minimum sample / blend | n < 10 days: planned efficiency, confidence LOW; 10-19: w = min(0.5, n/40); ≥ 20: w = 0.7; w ≤ 0.3 when robust CV > 0.25 or plan row / OB changed in window. Supersedes doc 04:64-66 (5 days) | Stricter minimum is the conservative choice |
| D6 | Efficiency grouping | line × style family (`product_type`, blank = `UNSPECIFIED`), fallback line-all-families (confidence ≤ MEDIUM), then planned; never pooled across lines or tenants | Line-specific, no cross-tenant |
| D7 | Supplier promise date | `purchase_orders.expected_date`; supplier updates are ETA, not the promise | Standard OTD measures against the original commitment |
| D8 | Receipt date ("in full") | Date of the RECEIVED GRN that brings cumulative QC-accepted qty ≥ 95 % of the line qty; open lines past promise with no full receipt count as lateness = today - promise (lower bound) | OTIF; censoring late lines would bias optimistic |
| D9 | Lateness stats | 365-day window, nearest-rank P50/P80/P90 in whole days; hierarchy vendor×category (n ≥ 5), vendor (≥ 5), tenant category (≥ 5), tenant all (≥ 5), else UNKNOWN (no adjustment) | Min-5 rule; in-tenant fallback only |
| D10 | Applying lateness | Only to ETA sources `PO_EXPECTED_DATE` / `ORDER_DATE_PLUS_LEAD_TIME`; lateness clamped ≥ 0; supplier-confirmed dates used as given; any date < today becomes today | Never predicts earlier than the promise |
| D11 | Delivery spread | Rolling 5-production-day mean efficiencies → ratio r_q = quantile_(1-q) / median; rate_q = rate_likely × r_q; n < 10 → Phase 1 fixed bands, labelled | Deterministic, no Monte Carlo |
| D12 | Combining material + rate | Same q for both (comonotonic) | Conservative; calibration will show if too wide |
| D13 | On-time probability | Grid q = 0.05…0.95; p = max q with finish_q ≤ target; shown "< 5 %" / "≥ 95 %" at the ends | Simple, explainable |
| D14 | Calibration | Brier, reliability bins of width 0.2, P80/P90 coverage; one snapshot per order at lead buckets 28 / 14 / 7 days (±3); label "calibrated" only with ≥ 30 resolved outcomes; no automatic recalibration | Avoids counting the same order many times; honest labelling |
| D15 | Actual ex-factory | Latest `delivery_date` of non-draft, non-cancelled challans linked to the order, once order status is shipped / closed; none within target + 30 days → UNKNOWN (excluded) | Doc 08:42 "back-test vs actual challans" |
| D16 | Anomaly method | Modified z = 0.6745·(x - median)/MAD; MAD = 0 → (x - median)/(1.253314·MeanAD); both 0 → skip; flag at \|z\| ≥ 3.5; one-sided (low output / efficiency, high rejection); baseline 30 production days, min 10 points; rejection needs ≥ 5 rejected pieces | Iglewicz-Hoaglin standard; volume guard against noise |
| D17 | Bottleneck types (Phase 4) | DELIVERY_RISK, LATE_MATERIAL, CAPACITY_OVERLOAD, LINE_IDLE, OUTPUT_DROP, QUALITY_SPIKE. Lab dip, sample, BTB, financing, machine breakdown deferred | Only types with deterministic data and no money |
| D18 | Priority / severity | priority = severity_weight × days_affected × max(1, orders_affected) × confidence; no value weight. Severity: critical if delay ≥ 7 days or (due ≤ 14 days and p < 0.3); high if delay ≥ 3 days or p < 0.5; else medium | Alerts are widely visible, so no money (doc 07:49-50 weight dropped) |
| D19 | Alert volume | ≤ 20 per tenant per run, ≤ 5 per department; stable natural keys; findings decided in the last 7 days are suppressed | Alert-fatigue control |
| D20 | Alert mechanics | Daily job persists findings; registered alert rules only read the stored findings (cheap during the 15-minute scan); the daily job resolves stale `mfg_*` alerts | The 15-minute scan runs every registered rule (`celery_app.py:101`, `alert_engine.py:236`) and re-opens resolved alerts (`:112-115`) |
| D21 | Recommendation acceptance | Records the decision only; UI then opens the existing screen (Plan changes pre-filled when `mfg_integrated_planning_v1` is on; PO / line plan otherwise); creates nothing | Most conservative; existing approvals stay authoritative |
| D22 | Decision permission | `ai.agents.confirm` or admin/manager (`_can_confirm`) + `production.planning.read` + source key (LATE_MATERIAL: inventory read in enforce mode) | Doc 08:56 / 09:82 |
| D23 | Outcome | Accepted / rejected / ignored (no decision by deadline) + MET / NOT_MET / UNKNOWN measured after the deadline (section 5.6); shown as association, not causation | Standard recommendation tracking |
| D24 | Storage | New tables `mfg_prediction_snapshots`, `mfg_predictive_findings` (migration 300); nullable `ai_agent_decisions` columns (301) | Calibration and exposure logging need persistence; doc 09 extension kept |
| D25 | Retention | Snapshots and cleared findings older than 400 days are purged by the daily job (bounded batches) | Bounded growth; one year plus a buffer |
| D26 | LLM | `generate_text_for_tenant`, 20 s timeout; prompt = redacted, clamped facts (order / line codes, dates, %, reason codes; vendor pseudonyms; no buyer / employee names); numbers checked with `validate_answer`; any failure → rule text | Fail closed; numbers come from the engine |
| D27 | AI agent tools | 3 read tools (`mfg_delivery_forecast`, `mfg_bottlenecks`, `mfg_supplier_lateness`); the handler returns `FEATURE_DISABLED` when the flag is off | Keeps `openai_tool_specs` static (test `test_ai_agent_mode.py:176`) |
| D28 | Owner brief | mfg agent findings enter the owner brief only when `mfg_predictive_ai_text_v1` is on | The brief is LLM text (`governed_ai/router.py:333-350`) |
| D29 | HR / finance data | Available minutes come from plan operator counts / shifts (no attendance, no employees); no money | Least data |

## 4. Data model (migrations 300, 301; head file today 299)

**300 `mfg_predictive_tables`** (new tables, RLS `p7_tenant_isolation` in the same migration, pattern 297:37-60):
- `mfg_prediction_snapshots`: id, tenant_id FK CASCADE, order_id FK orders CASCADE, as_of_date Date, target_date Date
  null, model_version String(24), band String(16), p50_date / p80_date / p90_date Date null, on_time_probability
  Numeric(5,4) null, efficiency_source String(16), lateness_source String(24), confidence String(8), reason_codes JSONB,
  inputs_hash String(64), actual_date Date null, on_time Boolean null, outcome_at DateTime null, created_at.
  Unique (tenant_id, order_id, as_of_date, model_version); index (tenant_id, as_of_date); partial index (tenant_id,
  order_id) WHERE outcome_at IS NULL.
- `mfg_predictive_findings`: id, tenant_id, finding_key String(160), kind String(24) (CHECK allowlist D17), severity
  String(16), priority Numeric(14,4), department String(48), order_id FK SET NULL null, line_id FK sewing_lines SET NULL
  null, status String(12) (OPEN | CLEARED), first_detected_on / last_detected_on Date, deadline_date Date null,
  payload JSONB (facts, assumptions, recommendation, alternatives, approval requirement, confidence; no money),
  decision_id FK ai_agent_decisions SET NULL null, decision_status String(12) null (ACCEPTED | REJECTED | IGNORED),
  outcome_status String(12) null (MET | NOT_MET | UNKNOWN), outcome_json JSONB null, outcome_measured_at DateTime null,
  created_at, updated_at. Partial unique (tenant_id, finding_key) WHERE status = 'OPEN'; index (tenant_id, status,
  priority DESC); index (tenant_id, deadline_date) WHERE outcome_status IS NULL.
- Downgrade: drop both tables (export first). Existing rows unaffected (new tables).

**301 `ai_agent_decisions_recommendation`** (nullable columns, existing RLS from 270 is unchanged): `recommendation_json`
JSONB, `deadline_date` Date, `finding_id` Integer FK mfg_predictive_findings SET NULL. Downgrade drops the columns.
`decision` String(16) already fits ACCEPTED / REJECTED (`models/ai_agents.py:23`). No NOT NULL step needed.

## 5. Formulas and missing-data behaviour

5.1 **Line-day efficiency** (sewing only): `earned = Σ good_qty × SMV(row)` (SMV per `line_style_config_id` via
`resolve_smv_for_rows`, row missing → style standard SMV when integrated planning is on, else the day is excluded);
`available = DayCap.theoretical_minutes` for that line-day from `compute_capacity` over the history window; `e = earned /
available`. Excluded: available unknown or 0, earned 0 (line not working), e > 1.5 (data error, counted in
`excluded_days`). Decimal, 4 dp, ROUND_HALF_UP.
5.2 **Blended efficiency**: D4-D6; output {value, planned, empirical, w, n, robust_cv, source EMPIRICAL | BLENDED |
PLANNED, confidence}. No plan row and no history → UNKNOWN (Phase 1 rule, never a default).
5.3 **Supplier lateness**: `L = receipt_date - promised` (D7-D9) per PO line; statuses read from `OPEN_PO_STATUSES`
plus the closed statuses found in code at build time (Phase 3 M6 rule). Output per group {n, p50, p80, p90, on_time_rate
= share L ≤ 0, source}. Promise missing → line excluded.
5.4 **Predicted receipt** per open PO line: `R_q = max(today, eta + max(0, L_q))` for the D10 sources, else
`max(today, eta)`; ETA UNKNOWN → R_q UNKNOWN.
5.5 **Delivery forecast** per confirmed order: material_ready_q = latest R_q among the open PO lines (ETA order) needed
to cover each BOM shortage from `compute_material`; shortage not covered → UNKNOWN (`MATERIAL_NOT_ON_ORDER`); READY →
none. `start_q = first working day ≥ max(today, live_start, material_ready_q)`; `rate_q = Σ_lines operator_minutes ×
blended_eff × r_q / SMV` (D11); `finish_q = add_working_days(start_q, ceil(remaining / rate_q))` + open POST_SEWING
stage days (integrated only, as in Phase 1); p from D13; band ON_TRACK (p ≥ 0.8), AT_RISK (0.5-0.8), LATE (< 0.5),
COMPLETE, UNKNOWN. Every result lists `missing_inputs`, `assumptions`, `drivers` (top 3: material, efficiency, load).
5.6 **Outcomes** (daily, after deadline): DELIVERY_RISK → MET if actual ≤ target (D15); LATE_MATERIAL → MET if usable
receipt by the need date; CAPACITY_OVERLOAD / LINE_IDLE → MET if the latest run no longer shows the condition for the
original dates; OUTPUT_DROP / QUALITY_SPIKE → MET if the next 3 production days have \|z\| < 2; no data by deadline + 30
days → UNKNOWN. Ignored = no decision by `deadline_date`.
5.7 **Calibration**: `Brier = (1/N)·Σ(p_i - o_i)²`; bins [0,0.2) … [0.8,1.0]: mean p vs hit rate; coverage_P80 = share
actual ≤ p80_date. N < 30 → `{status: "INSUFFICIENT_OUTCOMES", n}`.
5.8 **Anomalies** (D16): metrics per line-day (efficiency, rejection rate = reject / (good + reject)) and per line ×
hour_slot (good_qty); window ≤ 31 days per request; baseline = previous 30 production days of the same series.

## 6. Services and files

Read-only (`backend/app/modules/mfg_intelligence/`, must pass the read-only source scan):
`predictive_stats.py` (pure: winsor, EWMA, nearest-rank quantiles, modified z, Brier, bins), `empirical_efficiency_service.py`,
`supplier_lateness_service.py`, `delivery_forecast_service.py` (calls Phase 1 building blocks; never changes
`predict_deliveries`), `anomaly_service.py`, `bottleneck_service.py` (pure finding builder from the above + Phase 1 line
loading), `predictive_read_service.py` (reads findings / calibration tables), `predictive_router.py` (GETs), `flags.py`
(+ `predictive_on`, `require_predictive_enabled`), `schemas.py` (additive).
Writers: `backend/app/modules/mfg_planning/predictive_writer.py` (snapshot upsert, findings upsert / clear, outcomes,
purge, stale-alert resolver like `alert_engine.py:28-56`), `mfg_planning/predictive_router.py` (decision POST, explain
POST), `mfg_planning/predictive_alert_rules.py` (rule functions reading OPEN findings; flag off → `[]`), registered
lazily in `merch/alert_rules.py` `RULE_REGISTRY` + `DEFAULT_DEFINITIONS` (6 keys `mfg_*`, entity order / sewing_line);
`governed_ai/detectors.py` (+ agent `mfg_bottleneck`, detector reads OPEN findings, capped `MAX_PER_AGENT`);
`governed_ai/router.py` (`AGENT_PERMISSION["mfg_bottleneck"]="production.planning.read"`, `_key_prefix` "mfg_",
flag check in `_agent_allowed`, owner-brief rule D28); `ai_tool/agent/catalog.py` (+3 tools, gate `GATE_PRODUCTION`,
supplier tool also `GATE_INVENTORY`); `workers/mfg_predictive_worker.py`; `common/celery_app.py` (import + daily
schedule); `common/tenant_feature_keys.py` (2 keys); Settings guard in `PUT /settings/config` (switching on needs
`manufacturing_intelligence_v1`; audited, same as Phase 2/3); models `app/models/mfg_predictive.py`, `ai_agents.py`.

## 7. API (prefix `/api/v1/mfg-intelligence`; router-level `production.planning.read`; tenant mismatch 403; flag off 404)

| Method / path | Extra permission | Flag | Writes |
|---|---|---|---|
| GET `/predictive/orders/{id}/delivery-forecast` | PO / vendor detail only with inventory read (enforce) | predictive | no |
| GET `/predictive/line-efficiency?date_to&factory_unit&line_id` | - | predictive | no |
| GET `/predictive/supplier-lateness?vendor_id&category_id` | inventory read (enforce) else 403 | predictive | no |
| GET `/predictive/anomalies?date_from&date_to&line_id` (≤ 31 days) | - | predictive | no |
| GET `/recommendations?status&kind&limit≤100` | source key per kind (LATE_MATERIAL inventory) | predictive | no |
| GET `/predictive/calibration` | - | predictive | no |
| POST `/recommendations/{finding_id}/decision` {decision ACCEPT/REJECT, note ≤ 500, request_id} | D22 | predictive | decision row, finding link, `log_ai_event` |
| POST `/predictive/explain` {subject: order/finding, id} | `ai.tools.production.read` (`has_tool_permission`) | predictive + ai_text | usage row, audit |

Decision POST: `with_for_update` on the finding, tenant-filtered (another tenant's id → 404), must be OPEN; the server
re-reads the payload (never from the browser, like `router.py:236-241`); same request_id or an existing decision →
returns the stored result (idempotent). New routes are added to `tests/test_route_permission_inventory.py`.

## 8. Alert / agent integration

The daily job writes findings; the 15-minute scan mirrors OPEN findings into `alert_instance` through `run_rule`
(natural key = finding_key, `evidence_json` via `_evidence_schema_v1`, related entity order / line). Cleared findings →
stale alert resolved by the job. Flag switched off → the job resolves every open `mfg_*` alert for that tenant once and
then skips. Governed AI page shows "Production bottlenecks" with the existing notify / dismiss; `_hidden_keys` already
hides keys with any recent decision, so MI accept / reject and governed-AI dismiss stay consistent.

## 9. Frontend (panel G) and tutorials

`frontend/src/api/mfgPredictive.ts`, `hooks/useMfgPredictive.ts`; `components/control-tower/intelligence/phase4/`:
`PredictionsTab.tsx` (sub-sections: Delivery forecast for the picked order with P50 / P80 / P90 + probability +
drivers + "uncalibrated" label; Bottlenecks & recommendations list with one Actions dropdown per row: View evidence,
Accept, Reject, Open screen; Line efficiency table; Supplier lateness (only with the inventory hint); Anomalies;
Calibration card), `phase4Logic.ts` (`readPhase4Flags` strict, tab visibility, labels), `ExplainButton.tsx` (shows
"AI wording" tag; only with ai_text flag). `ManufacturingIntelligenceSection.tsx` gains a `phase4` prop and tab id
`predictions` via `visibleTabs`; caller passes strict flags where Phase 2/3 flags are read. Settings switches in
`ConfigurationPage.tsx`. Loading / error / empty states, phone cards. Tutorials: `mfg-intel-predictions` in
`data/tutorials/sections/manufacturing.ts` (+ `lastUpdated`), AGENTS.md entry.

## 10. Celery job `mfg.predictive_daily`

`workers/mfg_predictive_worker.py` mirrors `mfg_planning_worker.py:35-73`: loop `active_tenant_rows`; per tenant with
both flags: `bind_session_tenant`, forecast ≤ 200 confirmed orders (earliest target first, truncation logged), upsert
today's snapshot, build findings → upsert / clear, apply cap D19, resolve stale alerts, measure due outcomes (≤ 500
rows), backfill snapshot outcomes for shipped orders, purge (≤ 5,000 rows); commit per tenant; exception → log,
`safe_async_session_rollback`, continue. Uses `run_async`. Scheduled once a day (`celery_app.py:50-92` block). No LLM in
the job.

## 11. Security and privacy

Tenant filter on every query; `db.get` followed by a tenant check; ids from the client validated (finding id,
order id via `_get_order` pattern); no cross-tenant fallback (tests). No money anywhere in Phase 4; if a later slice
adds money it goes through `finance_gate.assert_mfg_finance_view` (`finance_gate.py:25-41`). No employee-level data.
AI never writes: agent tools are read-only and allowlisted; explain returns text only; LLM text tagged `AI_TEXT`, never
stored over values; prompt redacted + clamped; numbers validated; timeout / failure → rule text, rollback, audit
`decision=warn`. Bounded queries (window caps, LIMITs, `MAX_PAGE_SIZE`); sort fields allowlisted.

## 12. Tests (backend `docker compose exec backend pytest ...`; frontend `npm test`)

New: `tests/test_mfg_predictive_stats.py` (EWMA, winsor, nearest-rank, modified z incl. MAD = 0 / MeanAD / both 0,
Brier, bins, all Decimal), `test_mfg_empirical_efficiency.py` (min-sample fallbacks 9 / 10 / 20 days, family fallback,
dispersion cap, sewing-only multi-department, excluded days), `test_mfg_supplier_lateness.py` (in-full rule, open-late
lower bound, hierarchy min 5, tenant-only fallback with a second tenant's data present), `test_mfg_delivery_forecast.py`
(P50 = Phase 1 likely when spread 1; quantile order P50 ≤ P80 ≤ P90; material UNKNOWN; probability grid ends),
`test_mfg_predictive_anomalies.py`, `test_mfg_predictive_findings.py` (dedupe, cap 20 / 5, severity, suppression),
`test_mfg_predictive_alerts.py` (scan mirrors only OPEN findings; flag off → none; stale resolved; flag-off cleanup),
`test_mfg_recommendation_decision.py` (permission denial, cross-tenant 404, double submit = one row, server-side
payload, outcome MET / NOT_MET / IGNORED / UNKNOWN), `test_mfg_predictive_calibration.py` (lead buckets, N < 30),
`test_mfg_predictive_explain.py` (LLM down / timeout / invented number → rules text; redaction; ai_text flag off),
`test_mfg_predictive_worker.py` (fail-closed per tenant, bind_session_tenant, purge bound), `test_mfg_predictive_flag_off.py`
(all 404; Phase 1-3 responses byte-identical with flags on vs off), `test_mfg_predictive_query_count.py`
(`tests/query_counting.py`; constant queries for 1 vs 50 orders / lines). Extend: `test_mfg_intelligence_read_only.py`
(Phase 4 GETs + source scan), `test_mfg_intelligence_tenant_isolation.py`, `test_ai_agent_mode.py` (tools gated),
governed-AI agent tests, `test_rls_policies.py`, `test_route_permission_inventory.py`, `test_mfg_settings_guards.py`.
Frontend: `phase4/phase4Logic.test.ts`, `phase4/MfgPhase4Predictions.test.tsx`. Fixtures `tests/mfg_predictive_fixtures.py`.

## 13. Acceptance criteria

1. All flags off: every Phase 4 route 404, job skips, alert rules return none, Phase 1-3 outputs unchanged (flag_off test).
2. Efficiency uses earned / available minutes; < 10 days → PLANNED / LOW (efficiency test).
3. Supplier lateness P50/80/90 follow D7-D10; fallback never reads another tenant (lateness test).
4. Delivery forecast P50 ≤ P80 ≤ P90, probability from the grid, UNKNOWN never replaced by a date (forecast test).
5. Anomalies use modified z ≥ 3.5 with min 10 baseline points (anomaly + stats tests).
6. Bottlenecks reach `alert_instance` only through `run_rule`, deduped, ≤ 20 / tenant, stale ones resolved (alerts test).
7. Decision needs D22, is idempotent and audited, creates no plan / PO / payroll / financing row (decision test).
8. Outcomes and calibration follow 5.6 / 5.7 (decision + calibration tests).
9. LLM failure or invented number → rule text with unchanged numbers (explain test).
10. GETs perform no writes; queries bounded and constant (read-only + query-count tests).
11. Panel G hidden without the flag; Actions dropdown; supplier table hidden without the inventory hint (frontend tests).

## 14. Build runs (each ends green: focused + neighbouring tests, `python -c "import app.main"`, lint / build)

- **B1 backend core:** flags, migrations 300/301 (upgrade, downgrade, upgrade), models, stats, efficiency, lateness,
  forecast, anomalies, read endpoints, calibration read, read-only / isolation / flag-off / query-count tests.
- **B2 alerts / AI / recommendations:** findings builder, writer, worker + schedule, alert rules registration, governed
  AI agent, decision + explain routes, agent tools, Settings guard, remaining tests.
- **F frontend:** API, hooks, panel G, Settings switches, tutorials, AGENTS.md; `npm run lint`, `npm run build`, tests.
B1 must precede B2; F may start after B1 contracts are frozen (disjoint files).

## 15. Rollback and operational impact

Rollback: switch both flags off (the next daily run resolves open `mfg_*` alerts); `git revert`; `alembic downgrade 299`
drops the new columns and tables (export snapshots / findings first; decision audit rows stay). No env vars added
(LLM uses the existing provider settings); beat must run for the daily job (already in compose). No downtime; migration
creates empty tables + nullable columns with `lock_timeout`. Blast radius: tenants with the flags on; alert-definition
rows appear for all tenants but return nothing while the flag is off. Verify locally with `docker compose up` before
pushing (migration + Celery change).

## 16. Risks and open points

R1 challan status values and the shipped order statuses are UNVERIFIED - read the allowlists in code before B2 (as
Phase 3 M6). R2 historical `DayCap` may be UNKNOWN when old plan rows lack shift / operators → fewer samples (shown as
n). R3 comonotonic spread may be too wide; calibration shows it, no auto-fix. R4 the 15-minute scan re-opens alerts a
user resolved while the finding persists (existing engine behaviour); mitigated by D19 suppression. R5 `can_access_module`
with `production.planning.read` is UNVERIFIED; tool handlers also check `internal_permission_granted`. R6 owner brief
interplay (D28). R7 storage growth bounded by D25.

## 17. Plan-auditor resolutions (binding, 2026-11-13; override sections 3-12)

17.1 History capacity (5.1): new `history_plan_rows` loader = rows of the window lines, status not CANCELLED
(COMPLETED included), bounded MAX_PLAN_ROWS with truncation notice; feed the pure `compute_day_capacity` (no DB)
per line-day. Use `integrated_planning=False` for history AND forecast denominators in Phase 4 (plan-basis
operator-minutes; no attendance / assignment reads). Label metric "plan-basis efficiency (includes absence and
balancing loss)". Phase 4 always uses corrected capacity internally; the P50 = Phase 1 likely test runs with
`planning_math_v2` on and n < 10.

17.2 Actual ex-factory (D15, R1 resolved): shipped = challan status `POSTED` only. actual_date =
MAX(delivery_challans.delivery_date) of POSTED challans linked via delivery_challan_orders (NULL delivery_date rows
ignored). Outcome final when order.status = COMPLETED, or pipeline_status in (PAYMENT_RECEIVED, COMPLETED), or 30 days
since the latest POSTED challan. Censoring: when tenant_today > target and no POSTED challan dated <= target exists,
on_time = false is resolved immediately (late is known); P80/P90 coverage resolves false once today > p_q date
without shipment. Only CANCELLED orders are excluded. Order statuses have no SHIPPED value (workflow.py:48-55).

17.3 Alert content: alert title / description / evidence_json = kind, severity, order_code or line_code, affected
dates, days, reason codes, href `/app/control-tower?tab=predictions&finding=<id>`. Never vendor, PO, item,
efficiency %, lateness or probability values. Details only through MI endpoints (re-gated).

17.4 Alert episodes: natural_key = `mfg_<kind>:<finding.id>` (a cleared-then-recurring condition is a new finding
row = new alert). The rule skips a finding whose alert_instance status is not in ACTIVE_STATUSES unless the finding's
severity rank is higher than the instance's severity (escalation re-opens). Test: user resolves, next scan keeps it
resolved; escalation re-opens it.

17.5 Flag-off cleanup: (a) `PUT /settings/config` turning `mfg_predictive_intelligence_v1` off resolves active
`mfg_*` alert_instances in the same transaction (audited); (b) the daily job, for tenants with the flag off, runs one
bounded UPDATE of active `mfg_*` instances (no other work). Rule functions return [] when the flag is off.

17.6 LLM wording: the prompt uses placeholders without digits (ORDER_A, LINE_B, VENDOR_C, words "likely / safe /
worst-case date" instead of P50/P80/P90) and requests the validate_answer JSON shape; facts = FactRow (units
percent / days / count); all forecast dates passed as context_texts. After validation, placeholders are mapped back
server-side. Any ValidationFailure / timeout / empty → rule text. No buyer, employee or vendor names in prompts.

17.7 Agent tools: new gates `GATE_MFG_PRED = Gate("manufacturing", "ai.tools.production.read",
("production.access", "production.planning.read"))`; supplier tool additionally passes `GATE_INVENTORY`. The tools
are offered only when BOTH `mfg_predictive_intelligence_v1` and `mfg_predictive_ai_text_v1` are true
(`openai_tool_specs(tenant)` filters; update test_ai_agent_mode.py:176 to assert absent when off, present when on);
the handler re-checks the flags (FEATURE_DISABLED). Bottleneck tool omits vendor / PO fields unless the inventory gate
passes.

17.8 Explain route: `require_ai_access` + `evaluate_ai_safety_for_user(module="manufacturing",
safety_class="READ_ONLY", permission_key="ai.tools.production.read")`, `rate_limit_dependency("heavy")`,
`enforce_ai_daily_tenant_quota`; subject recomputed server-side; `asyncio.wait_for` 20 s like owner brief, then
`safe_async_session_rollback`, then audit + commit.

17.9 Decisions: one FK direction only: `ai_agent_decisions.finding_id` (301, nullable, FK SET NULL, indexed) +
partial UNIQUE (tenant_id, finding_id) WHERE finding_id IS NOT NULL AND decision IN ('ACCEPTED','REJECTED').
`mfg_predictive_findings.decision_id` dropped (keep denormalised `decision_status`). No request_id: idempotency =
finding row lock + existing decision → return stored (200) + unique index (IntegrityError → re-read). Governed-AI
DISMISSED on an mfg key also sets the finding `decision_status = REJECTED` via the shared writer; NOTIFIED is not a
decision. Downgrade 301 drops index, FK, columns; ACCEPTED/REJECTED rows stay and are read by governed AI as 7-day
hides.

17.10 Predicted receipt: load ETAs with `receipt_buffer_days=0`; R_q = max(today, eta_raw + max(buffer, L_q)) for
PO_EXPECTED_DATE / ORDER_DATE_PLUS_LEAD_TIME; supplier-dated sources: max(today, eta_raw + buffer).

17.11 Shared supply: when `mfg_material_allocation_v1` is on, use `compute_material_v3` holds / pegs only. Otherwise,
walk PO lines with `source_order_id = order` first, then unpegged lines in ETA order, and mark the result
`SHARED_SUPPLY_NOT_ALLOCATED` with confidence ≤ MEDIUM (never claimed as dedicated).

17.12 Quantiles and probability: lateness and efficiency quantiles at every grid q (0.05..0.95), nearest-rank
rank = ceil(q·n). Fixed-band fallback (n < 10) → on_time_probability = null, reason `INSUFFICIENT_HISTORY`, band from
P50/P90 only. Grid ends stored as 0.025 ("< 5 %") and 0.975 ("≥ 95 %"). r_q clamped to [0.5, 1.5]; P50 ≤ P80 ≤ P90
enforced monotone.

17.13 Statistics: MAD = 0 → winsorise with 1.253314·MeanAD; both 0 → no winsorising. EWMA seed = median of the
winsorised sample, α = 0.2, ordered by production date. robust_cv = 1.4826·MAD / median. Weight w = min(0.7, n/40)
for n ≥ 10 (continuous), capped at 0.3 when robust_cv > 0.25 or plan / OB changed. product_type grouped by
upper(trim()). Confidence weight for priority: HIGH 1.0, MEDIUM 0.75, LOW 0.5; severity weight critical 4, high 3,
medium 2.

17.14 Spread horizon: rolling window k = clamp(ceil(remaining / rate_likely), 5, 20) production days; needs ≥ k + 9
days of history, else 17.12 fallback.

17.15 Outcomes for CAPACITY_OVERLOAD / LINE_IDLE: MET if the finding was CLEARED before its deadline_date (first
affected day); NOT_MET if still OPEN at the deadline; never recomputed for past dates.

17.16 Supplier history: PO statuses APPROVED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED (exclude DRAFT,
SUBMITTED, CANCELLED). CLOSED short (< 95 % accepted) → last receipt date if any, else excluded. Open lines more than
180 days past promise → excluded as STALE. GRN rows with NULL received_date excluded. Label `promise_basis =
CURRENT_EXPECTED_DATE`. History read bounded to 20,000 PO lines (truncation notice).

17.17 Findings storage: all findings stored (≤ 500 OPEN per tenant); `alert_eligible` = top 20 per tenant / 5 per
department; only eligible ones are mirrored. `mfg_predictive_findings.tenant_id` FK tenants CASCADE; indexes
(tenant_id, order_id), (tenant_id, line_id). Phase 4 rows never block order / line deletes.

17.18 Job: crontab daily at 19:30 UTC (01:30 Asia/Dhaka); as_of_date = `tenant_today`; per-tenant
`SET LOCAL statement_timeout = '120s'`; fail closed per tenant.

17.19 Tests: query-count asserts constant queries vs history length and PO-line count for single-order GETs and
line-efficiency (lines 1 vs 50); the job asserts ≤ 200 orders. Flag-off "identical" compares JSON with volatile
timestamps removed and frozen tenant_today. New tests for 17.2 censoring, 17.4 re-open, 17.5, 17.6 placeholder
round trip, 17.7 flag filtering, 17.9 unique index double submit, 17.10 no double buffer, 17.12 null probability.
