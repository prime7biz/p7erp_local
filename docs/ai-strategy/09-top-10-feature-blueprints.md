# 09 - Top 10 Feature Blueprints

Part of the Prime7 AI strategy set. Index: [`AI_DEVELOPMENT_MASTER_PLAN.md`](../../AI_DEVELOPMENT_MASTER_PLAN.md).

**Audit date:** 2026-11-04
**Status:** Implementation-ready specifications **for review**. Nothing here is implemented. Each blueprint follows the project rules: additive and backwards-compatible changes, feature flag OFF by default, reversible Alembic migrations, backend commands run in Docker, and `await safe_async_session_rollback(db)` after any caught database error.

| # | Blueprint | Roadmap ID | Wave |
|---|---|---|---|
| 1 | AI guardrail hardening pack | P0-1, P0-2, P0-3, P0-4 | 1 |
| 2 | AI cost and usage telemetry | P0-5 | 1 |
| 3 | Prediction-outcome log | P1-1 | 2 |
| 4 | BTB maturity vs cash coverage alert | P1-2 | 2 |
| 5 | Cost-variance alerts | P1-8 | 2 |
| 6 | Production completion and shipment delay forecast | P1-4 | 2 |
| 7 | Unified order-risk score and TNA heatmap | P1-3 | 2 |
| 8 | Material shortage vs production start alert | P1-5 | 2 |
| 9 | Daily executive briefing with numeric consistency check | P1-6 | 2 |
| 10 | Unified ERP tool registry and approval inbox | P2-1, P2-2 | 3 |

Common conventions for all blueprints:

- **Money** is computed with `Decimal` and returned as strings (for example `"100.5000"`), matching the finance API convention. Note: `finance/exposure_service.py:build_maturity_ladder` currently returns `float`; new code must not copy that.
- **Alerts** reuse the existing engine: add a function to `backend/app/modules/merch/alert_rules.py:RULE_REGISTRY` and a row to `DEFAULT_DEFINITIONS`. `alert_engine.py:run_rule` upserts `AlertInstance` by `natural_key`, so repeat scans do not duplicate alerts. Scans are already scheduled (`scheduled.merch_alert_scan` every 15 minutes in `backend/app/common/celery_app.py`, or the in-process scheduler).
- **Tenant flags** are added to `backend/app/common/tenant_feature_keys.py` with default OFF unless stated.
- **Tests** run with `docker compose exec backend pytest -q <file>`.

---

## Blueprint 1 - AI guardrail hardening pack

**1. Business requirements and outcome.** AI limits and permissions must hold across all API workers and for every tenant. Outcome: no AI request can exceed configured limits by running on another worker; sensitive data needs an explicit grant; no code path defaults to a fixed tenant.

**2. Existing files.** `backend/app/modules/ai_tool/guardrails.py` (`enforce_route_rate_limit`, `rate_limit_dependency`, `should_block_circuit`, `record_circuit_failure`), `ai_tool/authz.py` (`has_tool_permission`), `ai_tool/tool_registry.py` (permission keys such as `ai.tools.finance.read`), `ai_tool/llm_provider/paid_provider.py` (`PaidLlmProvider.generate`), `mcp_server/tenant_guard.py` (`validate_tenant`), `backend/app/common/redis_client.py` (`get_redis`).

**3. Service structure.**
- `guardrails.py`: new `_redis_window_count(key, window)` using `INCR` + `EXPIRE`; existing deque logic kept as fallback when Redis is unavailable.
- `rate_limit_dependency` changes from header-derived keys to a dependency that receives the authenticated `User` and `Tenant` and uses `f"{tenant.id}:{user.id}"`.
- Circuit breaker state stored in Redis hash `ai:cb:{tool_key}` with fallback.
- `authz.py`: new constant `SENSITIVE_AI_TOOL_KEYS = {"ai.tools.finance.read", "ai.tools.payroll.read", "ai.tools.hr.read"}` (final list confirmed during implementation). For these keys, a missing value means **deny** for non-admin/manager roles.
- `paid_provider.py`: `generate(self, prompt, *, tenant_id: int)` - required keyword argument, no default.
- `tenant_guard.py`: return `(False, ...)` when `context_tenant_id is None`.

**4. Database.** None.

**5. API.** No new endpoints. Settings -> Roles registry (`GET /settings/permissions-registry`) should list the sensitive AI keys so admins can grant them.

**6. Frontend.** Settings -> Roles shows a new group "AI data access" with the sensitive keys. No other UI change.

**7. AI prompts, tools, models.** None.

**8. Workflow integration.** None; behaviour change is limited to denials and limits.

**9. Security.** This blueprint is the security change. Rollout risk: roles that relied on implicit finance access lose it. Mitigation: a one-off read-only report listing roles that will lose access (reuse `backend/scripts/rbac_access_report.py` approach) before enabling.

**10. Tests and acceptance.** New `backend/tests/ai/test_guard_rate_limits.py`, `test_guard_permissions.py`, `test_guard_tenant.py`, `test_guard_commit.py` covering scenarios T3, T4, T5, T6, T11, T12 in doc 07. Accept when all pass and existing AI tests still pass.

**11. Performance and cost.** One Redis round-trip per AI request (sub-millisecond on the internal network). No AI cost.

**12. Dependencies and sequence.** Redis (exists). Order: tests first (they will fail), then fixes. Rollback: `git revert`; Redis fallback keeps the service working if Redis is down. Operational note: tell admins about the new permission keys before deploying.

---

## Blueprint 2 - AI cost and usage telemetry

**1. Requirements.** Owners and platform admins need cost per tenant, per feature and per provider. Outcome: monthly cost report and budget enforcement based on real data.

**2. Existing files.** `ai_tool/audit.py:log_ai_event` (has `cost_estimate_usd` parameter), `ai_tool/llm_provider/openrouter_client.py:parse_openai_compatible_usage`, `paid_provider.py` (parses usage), `backend/app/common/gemini_client.py:generate_text_for_tenant` (records usage), `backend/app/modules/admin/ai_router.py` (platform AI ops), `backend/app/config.py`.

**3. Service structure.** New `backend/app/modules/ai_tool/cost.py`:
- `estimate_cost_usd(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> Decimal`
- Price table from new setting `AI_MODEL_PRICES_JSON` (default `{}`; unknown model = cost 0 with `cost_unknown=true` in audit metadata, never an error).
- Call sites pass the estimate into `log_ai_event`.

**4. Database.** None (column exists). Optional later: monthly roll-up view.

**5. API.** `GET /api/v1/admin/ai/usage?month=YYYY-MM` returns per tenant: requests, prompt tokens, completion tokens, cost (string), share answered without paid calls. Tenant admin variant: `GET /api/v1/ai-tool/usage/summary` scoped to own tenant.

**6. Frontend.** Platform admin AI ops page: table and month picker. Tenant settings: small usage card.

**7. AI.** None.

**8. Workflow.** Feeds budget checks already in config (`ai_monthly_budget_limit`).

**9. Security.** Platform admin endpoint requires platform admin auth (`admin/auth.py`). Tenant endpoint filters by tenant. No prompt text in the report.

**10. Tests.** Unit test for price math and unknown models; HTTP test that tenant A cannot see tenant B usage.

**11. Performance.** Aggregate query on `ai_audit_logs` by tenant and month; check the index on `(tenant_id, created_at)` exists during implementation.

**12. Sequence.** Independent; do early so later features are measured. New env var has a safe default; no `.env` change required.

---

## Blueprint 3 - Prediction-outcome log

**1. Requirements.** Every score or forecast shown to users must be stored with the actual outcome later, so accuracy can be reported. Outcome: an accuracy page per capability after a few weeks.

**2. Existing files.** `backend/app/models/ai_tool.py` (pattern for AI tables), `ai_tool/repository.py`, `AiFeedback` model.

**3. Service structure.** New `backend/app/modules/ai_tool/prediction_log.py`:
- `record_prediction(db, *, tenant_id, capability, entity_type, entity_id, horizon_date, prediction: dict, model_version: str)`
- `record_outcome(db, *, tenant_id, capability, entity_type, entity_id, outcome: dict)`
- `accuracy_summary(db, *, tenant_id, capability, since)` returning metric values defined per capability (MAE days, precision@k).
- Outcome writers are small hooks called by existing jobs (for example when an order ships, record actual ship date for `completion_forecast` and `order_risk`).

**4. Database.** New table `ai_prediction_log` (additive, reversible):

| Column | Type |
|---|---|
| id | bigint PK |
| tenant_id | FK tenants, indexed |
| capability | varchar(64) - e.g. `completion_forecast`, `order_risk`, `shortage_alert` |
| entity_type, entity_id | varchar(32), int |
| predicted_at | timestamptz |
| horizon_date | date null |
| model_version | varchar(64) - e.g. `ewma_v1` |
| prediction_json | JSON |
| outcome_json | JSON null |
| outcome_at | timestamptz null |

Index `(tenant_id, capability, entity_type, entity_id, predicted_at)`. `downgrade()` drops the table (safe: new, unpopulated by other features). Retention: follow `docs/AI_RETENTION_RUNBOOK.md` pattern.

**5. API.** `GET /api/v1/ai-tool/accuracy?capability=...&since=...` (AI access + tenant).

**6. Frontend.** New tab "Accuracy" on `/app/ai/predictions` showing metric, sample size and trend. Must show "Not enough outcomes yet" below a minimum count.

**7. AI.** None.

**8. Workflow.** Blueprints 6, 7 and 8 write predictions here.

**9. Security.** Tenant-scoped; no personal data in JSON (store ids, not names).

**10. Tests.** Write/read isolation across tenants; accuracy math with fixed fixtures.

**11. Performance.** At most one row per entity per capability per day (upsert by day) to keep volume small.

**12. Sequence.** First item in wave 2. Migration runs with `docker compose exec backend alembic upgrade head`; rollback `alembic downgrade -1`.

---

## Blueprint 4 - BTB maturity vs cash coverage alert

**1. Requirements.** Finance must see, at least 14 days ahead, any BTB LC maturity that projected cash cannot cover. Outcome: fewer forced short-term borrowings and no missed maturities.

**2. Existing files.** `merch/alert_rules.py:rule_btb_lc_maturity_due_or_overdue` (date window only), `rule_master_contract_btb_utilization_risk`, `finance/exposure_service.py:build_maturity_ladder`, models `BtbLc` (`maturity_date`, `maturity_amount`, `currency`, `exchange_rate_to_base`, `bank_account_id`), `BtbMaturityTranche`, `BtbLcAccounting`, `BankAccount.current_balance` (`Decimal`), `CommercialInvoice`, `finance/enhanced_cash_flow_service.py`, `finance/party_ledger_service.py`. UI: `frontend/src/pages/app/reports/ReportBtbMaturityPage.tsx`, `MerchCriticalAlertsPage.tsx`.

**3. Service structure.** New `backend/app/modules/finance/btb_coverage_service.py`:
- `build_coverage_ladder(db, *, tenant_id, horizon_days=60) -> list[CoverageBucket]`
- Per week bucket: opening cash (sum of active `BankAccount.current_balance` in base currency), plus expected receipts (open commercial invoices with expected date - see data note), minus BTB maturities (unrealised tranches converted with `exchange_rate_to_base`), minus known payment runs. Running balance per bucket.
- New alert rule `rule_btb_maturity_cash_shortfall` in `alert_rules.py` that flags buckets where running balance < 0 or < configurable safety buffer. `natural_key = f"btb_cash_shortfall:{tenant_id}:{bucket_start}"`.

Data notes (from doc 03): commercial invoices have no structured expected payment date. V1 uses invoice date + configurable default days (`config["default_collection_days"]`, default 45) and labels this assumption in `evidence_json`. Missing exchange rates make the tranche "unconverted" and raise a separate data-quality note instead of guessing.

**4. Database.** None for v1.

**5. API.** `GET /api/v1/finance/btb-coverage?horizon_days=60` returning buckets with string amounts and the assumptions used.

**6. Frontend.** Add a "Cash coverage" section to `ReportBtbMaturityPage.tsx`: table by week (opening, inflows, maturities, closing) with red rows for shortfall. Alerts appear in the existing critical alerts page.

**7. AI.** No model. Optional later: one-sentence explanation from a small model using only the bucket table.

**8. Workflow.** Alert links to the BTB LC and to the cash forecast scenario screen.

**9. Security.** Finance permission required (reuse the finance read permission used by exposure endpoints). Flag `btb_cash_coverage_enabled` default OFF.

**10. Tests.** Fixtures: two tenants; tenant A with a USD BTB tranche due in 10 days exceeding BDT bank balance after conversion; tenant B data must not affect tenant A (scenario T13). Accept when shortfall alert is created once and updated, not duplicated, on rescan.

**11. Performance.** Few rows per tenant; runs inside existing scan schedule.

**12. Sequence.** Independent of other blueprints. Records predictions in blueprint 3 if available (capability `btb_cash_shortfall`).

---

## Blueprint 5 - Cost-variance alerts

**1. Requirements.** Merchandisers and finance must be alerted when an order's actual material or CM cost exceeds the quoted cost by a threshold, before shipment. Outcome: margin leaks caught earlier.

**2. Existing files.** `merch/costing_variance_service.py`, `merch/alert_rules.py:rule_production_cm_overrun` (CM only), `rule_wastage_vs_bom`, `rule_trim_overconsumption_above`, `merch/merch_control_tower_service.py`.

**3. Service structure.** New rule `rule_order_material_cost_overrun` calling the existing variance service per open order and alerting when material cost variance % exceeds `config["threshold_pct"]` (default 5). Evidence includes quoted vs actual per category.

**4. Database.** None.

**5. API.** None new; alerts API exists.

**6. Frontend.** Existing critical alerts page; add filter chip "Cost".

**7. AI.** None.

**8. Workflow.** Alert links to the order costing variance view.

**9. Security.** Merch permissions; finance-sensitive values visible only to roles that can already see costing.

**10. Tests.** Order with 8 percent overrun creates one alert; 3 percent does not; other tenant unaffected.

**11. Performance.** Limit to orders in active statuses; batch queries rather than per-order N+1 (check variance service query pattern during implementation).

**12. Sequence.** Independent. Rollback: disable the alert definition for the tenant.

---

## Blueprint 6 - Production completion and shipment delay forecast

**1. Requirements.** Planners and merchandisers need a realistic completion date for each line plan and order, based on actual output, and a warning when it falls after the delivery date. Outcome: earlier overtime, line reallocation or buyer communication.

**2. Existing files.** Models `SewingLineStyleConfig` (`planned_qty`, `completed_qty`, `start_date`, `planned_end_date`, `target_efficiency_pct`, `smv_per_piece`, `operator_count`), `HourlyProductionEntry` (`production_date`, `hour_slot`, `good_qty`, `line_style_config_id`, `order_id`), `Order.delivery_date`; services `production/efficiency_ai_service.py` (currently LLM-assisted), `production/pipeline_service.py`, `ai_tool/forecast/adapters.py` (shipment delay heuristic). UI: `frontend/src/pages/app/manufacturing/ProductionPlanningPage.tsx`.

**3. Service structure.** New `backend/app/modules/production/completion_forecast_service.py`:
- `daily_output_series(db, tenant_id, line_style_config_id, days=14)` - sum `good_qty` per production date.
- `ewma(values, alpha=0.3)` - pure function, unit tested.
- `forecast_config(...)` returns: remaining qty = planned - completed; daily rate = EWMA (fallback: target from SMV, operators and efficiency when fewer than 3 days of data); working days needed; forecast end date using the factory calendar if available, otherwise skipping Fridays as configured per tenant; confidence = "low" when fewer than 5 data days.
- `forecast_order(...)` takes the latest end date across the order's configs and compares with `Order.delivery_date` minus a configurable shipment buffer (default 3 days) - gives `delay_days`.
- Writes to `ai_prediction_log` (capability `completion_forecast`, model_version `ewma_v1`).

**4. Database.** None beyond blueprint 3.

**5. API.** `GET /api/v1/production/forecast/line-plans?status=in_progress` and `GET /api/v1/production/forecast/orders/{order_id}`; returns quantities, rate, dates, delay days, confidence, and the inputs used.

**6. Frontend.** New "Forecast" column in Production Planning pipeline (forecast end date, coloured red when after delivery buffer). Order detail page: small "Production forecast" card.

**7. AI.** No model for numbers. The existing efficiency AI text may reference forecast numbers but must not compute them.

**8. Workflow.** Feeds blueprint 7 (order risk) and blueprint 8 (shortage timing).

**9. Security.** Production read permission; tenant scoped. Flag `completion_forecast_enabled` default OFF.

**10. Tests.** EWMA unit tests; fixture with 10 days of hourly data and known expected date; zero-data case returns target-based forecast with `confidence="low"`; tenant isolation.

**11. Performance.** Aggregate in SQL by date (not per hour row in Python); compute nightly for active configs and cache, with on-demand recompute for a single order.

**12. Sequence.** After blueprint 3. Accuracy metric: MAE in days once outcomes (actual end date / ship date) are recorded.

---

## Blueprint 7 - Unified order-risk score and TNA heatmap

**1. Requirements.** Merchandising managers need one ranked list of orders most likely to ship late, with reasons. Outcome: attention goes to the right orders earlier; measured by precision of the top 10 list.

**2. Existing files.** `ai_tool/anomaly.py:_order_delay_anomaly`, `ai_tool/analysis/pipelines/order_risk.py`, `tna_unified/followup_ai_service.py`, `merch/merch_control_tower_service.py:build_merch_control_tower_summary`, `orders/order_ai_service.py` (planning risk), models `Order`, `order_followup_actions`, `SewingLineStyleConfig`. UI: `frontend/src/pages/app/MerchControlTowerPage.tsx`, `frontend/src/pages/app/manufacturing/TnaDashboardPage.tsx`.

**3. Service structure.** New `backend/app/modules/merch/order_risk_service.py`:
- Signals (each 0-1, with explanation text):
  - TNA: overdue critical milestones, weighted by days late (from follow-up actions)
  - Material: open BOM lines without GRN coverage before planned cut date
  - Production: `delay_days` from blueprint 6
  - Commercial: missing LC / PI before required stage
  - Time pressure: days to delivery
- Score = weighted sum; weights in tenant config with defaults; score bands Low / Medium / High.
- `top_risks(db, tenant_id, limit=20)` and `order_risk(db, tenant_id, order_id)`.
- Writes to prediction log (capability `order_risk`, `heuristic_v1`).
- Optional alert rule `rule_order_risk_high` when band becomes High.

**4. Database.** None (weights stored in existing tenant settings JSON or alert definition config).

**5. API.** `GET /api/v1/merch/order-risk?limit=20`, `GET /api/v1/merch/order-risk/{order_id}` with signal breakdown; `GET /api/v1/merch/tna-heatmap?weeks=8` returning milestone x week counts of overdue / due.

**6. Frontend.** Control tower: "Top risk orders" table (order, buyer, delivery date, score band, top two reasons, Actions dropdown per project rule). TNA dashboard: heatmap grid. Order detail: risk card with reasons.

**7. AI.** Optional small-model sentence summarising the reasons from the signal breakdown. Numbers and band come from the service only.

**8. Workflow.** Links to TNA actions, BOM, PO and production plan pages.

**9. Security.** Merch permissions (`merch.*` convention). Flag `order_risk_score_enabled` default OFF.

**10. Tests.** Fixtures with known signals give expected band; ordering stable; tenant isolation (scenario T1).

**11. Performance.** Compute nightly for active orders; on-demand for single order. Avoid per-order queries by batching signals.

**12. Sequence.** After blueprints 3 and 6. Update Help & Tutorials pages for control tower if UI changes (`.cursor/rules/tutorials-maintenance.mdc`).

---

## Blueprint 8 - Material shortage vs production start alert

**1. Requirements.** Store and planning must know, before a line starts, which materials will not be available on the planned start date. Outcome: fewer line stoppages caused by material.

**2. Existing files.** `inventory/mrp_engine_service.py` (projected balances, `explode_bom_for_order`), `inventory/reorder_service.py`, `ai_tool/tools/purchase_tools.py:suggest_orders_with_shortage`, models `PlannedOrder`, `SewingLineStyleConfig.start_date`, purchase orders and GRN. UI: `frontend/src/pages/app/inventory/mrp-idt/MRPRunPage.tsx`, Production Planning page.

**3. Service structure.** New `backend/app/modules/inventory/start_readiness_service.py`:
- For each line plan starting within N days (default 14): required qty per item (BOM explosion for that order and planned qty), available = on hand + reserved for this order + open PO qty with expected date before start.
- Shortage when available < required; severity by days to start.
- New alert rule `rule_material_short_before_line_start`, `natural_key = f"mat_short:{config_id}:{item_id}"`.
- Writes to prediction log (`shortage_alert`) so accuracy can be checked against actual stoppages or late GRN.

**4. Database.** None.

**5. API.** `GET /api/v1/inventory/start-readiness?days=14` returning per line plan: ready / at risk, short items, quantities, PO references.

**6. Frontend.** Production Planning: readiness badge per line plan. MRP page: "Start readiness" tab.

**7. AI.** None.

**8. Workflow.** Alert links to item, PO and line plan; later input to procurement recommender (P3-2).

**9. Security.** Inventory and production read permissions. Flag `start_readiness_alerts_enabled` default OFF.

**10. Tests.** Fixture: line starting in 5 days, fabric short by 200 m with a PO expected after start, gives alert; PO expected before start, gives none; tenant isolation.

**11. Performance.** Limit to line plans in the window; reuse MRP explosion results where cached.

**12. Sequence.** Can start in parallel with blueprint 6; uses its dates when available.

---

## Blueprint 9 - Daily executive briefing with numeric consistency check

**1. Requirements.** Owners want a short daily briefing that is always correct. Outcome: a briefing they trust; measured by the percentage of narratives passing the number check.

**2. Existing files.** `dashboard/executive_ai_brief_service.py`, `dashboard/ai_services.py`, `ai_tool/weekly_report_service.py`, `backend/app/common/gemini_client.py:generate_text_for_tenant`, UI `frontend/src/components/dashboard/AiBriefRenderer.tsx`, `Dashboard.tsx`.

**3. Service structure.**
- New `backend/app/modules/ai_tool/narrative_guard.py:check_numbers(narrative: str, facts: dict) -> GuardResult` - extracts numbers from the text and checks each matches a value in the facts snapshot (with formatting tolerance: thousands separators, percent, rounding to displayed precision). Fails on any unmatched number.
- Briefing service builds a deterministic facts snapshot (today's KPIs, new high alerts from blueprints 4-8, top risk orders), renders a **template text** first, then optionally asks a small model to rewrite it. If the guard fails, the template text is used and the failure is logged.
- Scheduled daily via beat (new entry next to `scheduled.weekly_ai_reports`) or in-process scheduler, per tenant timezone if available.

**4. Database.** Reuse `ai_weekly_reports` pattern; either add a `period_type` column (additive, default `weekly`) or a new `ai_daily_briefs` table. Decide during implementation; both reversible.

**5. API.** `GET /api/v1/dashboard/ai/daily-brief` (latest) and `POST .../regenerate` (rate limited, admin/manager).

**6. Frontend.** Dashboard brief card shows facts as a table and the narrative separately, with "Generated from data at HH:MM" and a badge when template text was used.

**7. AI.** Small model (OpenRouter free tier or Ollama) with a system prompt: "Rewrite the following facts into five short bullet points. Use only numbers present in the facts. Do not add numbers." Max tokens ~300. PII redaction applies for external providers.

**8. Workflow.** Links each bullet to its source screen.

**9. Security.** Facts snapshot respects the viewer's permissions: finance figures only for users with finance read; otherwise omitted. Generate per role group or filter at render time.

**10. Tests.** Guard unit tests (pass and fail cases, scenario T9); briefing falls back to template on failure; stub provider in CI.

**11. Performance and cost.** One small-model call per tenant per day; cost is near zero on free or local tiers. Measured by blueprint 2.

**12. Sequence.** After blueprints 4-8 provide content; the guard itself can ship earlier and be applied to the weekly report.

---

## Blueprint 10 - Unified ERP tool registry and approval inbox

**1. Requirements.** One place defines what AI can do, at what safety level, under which permission, and one inbox where humans approve drafts. Outcome: simpler maintenance and a safe foundation for real (L4) actions later.

**2. Existing files.** `ai_tool/tool_registry.py` (`REGISTRY`, `ToolDefinition`, `SafetyClass`), `mcp_server/tools.py` (`TOOL_REGISTRY`), `mcp_server/safety.py`, `ai_tool/policy_eval.py`, `ai_tool/artifacts/service.py`, `ai_tool/automation.py`, `erp_ai_phases/governance_service.py`, UI `AiGovernanceInbox.tsx`, `AiActionProposeCard.tsx`, `AiActionRunsTable.tsx`.

**3. Service structure.**
- New `backend/app/modules/ai_tool/erp_tools/` package:
  - `spec.py` - `ErpToolSpec` (see doc 04 section 3.1)
  - `registry.py` - single dictionary; adapters that expose it as chat `ToolDefinition`s and MCP tools (so existing callers keep working)
  - `executor.py` - one `execute(spec, input, ctx)` that runs permission, policy, tenant, idempotency and audit checks in a fixed order
- Approval: `AiApprovalArtifact` becomes the single record for drafts. Automation confirmations and governance proposals create artifacts too. The governance inbox UI reads artifacts.
- No change to what tools do: read tools stay read; MCP commit tools stay simulations until P3-1.

**4. Database.** Additive columns on `ai_approval_artifacts` if needed (`source` = automation / governance / mcp, `domain_permission_key`). Reversible. Existing governance proposal rows remain readable (no data migration in v1).

**5. API.** `GET /api/v1/ai-tool/approvals?status=pending`, `POST /api/v1/ai-tool/approvals/{id}/approve`, `/reject`. Existing endpoints remain as wrappers for backward compatibility.

**6. Frontend.** One "AI approvals" inbox under `/app/ai/automation` (tabs: Pending, History). Existing cards continue to work.

**7. AI.** None new.

**8. Workflow.** Prepares the path for L4 adapters (doc 04 section 3.3) without enabling them.

**9. Security.** Approver needs the domain permission; executor re-checks at approval time; all actions audited. Flag `ai_unified_approvals_enabled` default OFF; old paths stay active until switched.

**10. Tests.** Registry parity test (every old tool name resolves to a spec with the same safety class); approval permission tests; MCP and chat still list the same tools.

**11. Performance.** No runtime cost change.

**12. Sequence.** Wave 3, after wave 1 tests exist. Rollback: flag OFF returns to old paths.
