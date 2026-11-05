# 05 - AI / ML Feasibility

Part of the Prime7 AI strategy set. Index: [`AI_DEVELOPMENT_MASTER_PLAN.md`](../../AI_DEVELOPMENT_MASTER_PLAN.md).

**Audit date:** 2026-11-04
**Scope:** Can Prime7's real data support forecasting and machine learning, and which method is most practical for each capability?

**Limit of this audit:** only the schema and code were inspected. **No production data was queried.** Row counts, date spans and data quality per tenant are unknown and must be measured before any model work starts (Runtime-verify). Demo seed data is not evidence of real history.

---

## 1. What prediction code exists today (Verified)

| Component | Path : symbol | Technique |
|---|---|---|
| Forecast adapters | `backend/app/modules/ai_tool/forecast/adapters.py:_moving_average`, `_linear_slope`, `_sklearn_linear_project` | 3-period moving average; hand-written least-squares slope; optional `sklearn.linear_model.LinearRegression` |
| Forecast orchestration | `ai_tool/forecasting.py`, `ai_tool/forecast/job_manager.py` | Template routing; stored as `model_type="heuristic_v1"` |
| Model registry table | `models/ai_tool.py:AiForecastModel` (migration `126_ai_forecast_model_registry`) | Table exists; no trained models stored |
| Finance forecast | `ai_tool/finance_forecast_service.py:build_finance_forecast`, `_heuristic_risks` | Same adapters + optional LLM narrative |
| Anomaly detection | `ai_tool/anomaly.py` | Threshold rules in SQL |
| Turnover risk | `ai_tool/ai_turnover_prediction_service.py` | Weighted rule score - not ML |
| Attendance analysis | `ai_tool/ai_attendance_analysis_service.py` | Counters and day-of-week patterns |
| Production "predictive" | `production/predictive_heuristic_service.py` | Explicitly "no ML dependencies" |
| Order risk | `ai_tool/analysis/pipelines/order_risk.py` | Pandas over SQL counts |
| Embeddings | `ai_tool/retrieval/embeddings.py` | `all-MiniLM-L6-v2` (for search, not prediction) |

**Libraries installed** (`backend/requirements.txt`): `pandas`, `numpy`, `scikit-learn`, `prophet`, `statsmodels`, `sentence-transformers`.

**Finding:** `prophet` and `statsmodels` are installed but **never imported** anywhere under `backend/app` (verified by search). They add image size and build time with no benefit today. Recommendation: keep them only once a real Celery training job uses them; otherwise remove them in a separate, tested change (see doc 08, item P2-8).

---

## 2. Historical data coverage (schema level)

| Entity | Model | Time and label fields | Suitability |
|---|---|---|---|
| Hourly production | `models/production.py:HourlyProductionEntry` | `production_date`, `hour_slot`, `good_qty`, `reject_qty` | Strong time series if entered consistently |
| Stock movements | `models/inventory.py:StockMovement` | `movement_date`, `movement_type` | Strong event log for consumption |
| Attendance | `models/hr_attendance.py:AttendanceEntry` | `attendance_date`, `status`, `late_minutes` | Strong daily labelled series |
| Vouchers | `models/finance.py:Voucher` | `voucher_date`, `status` | Good dates; no status history table |
| Cash proxies | `PaymentRun`, `FxReceipt`, `OutstandingBill` | Dates and amounts | Usable for cash heuristics |
| Orders | `models/merch.py:Order` | `delivery_date`, `status`, `pipeline_status` | Current status only - "late" must be derived |
| TNA / follow-ups | `Followup`, follow-up actions | `due_date`, `completed_at` | Good for delay rules |
| Employee status | `models/hr.py:EmployeeStatusHistory` | History rows | Usable labels for attrition |

**Key gap: there are no status history tables for orders, vouchers or stock.** The system stores the current status, not when it changed. Most ML needs "what was known at time T, and what happened later". Without that, training labels must be reconstructed and are unreliable.

**Second gap: predictions are not stored with their outcomes.** Turnover, delay and defect scores are computed and shown, but never saved next to what actually happened. Accuracy cannot be measured today.

---

## 3. Approach comparison per capability

Approaches: (1) Rules / SQL analytics, (2) classical statistics or ML, (3) LLM reasoning.

| Capability | (1) Rules / SQL | (2) Stat / ML | (3) LLM | Recommended | Why |
|---|---|---|---|---|---|
| Raw-material demand / shortage | Open orders x BOM explosion + days-to-stockout (exists in MRP) | ETS / Prophet per item when 12+ months of movements exist | Explain only | **(1) now; (2) only for free-stock items with long history** | Garments are made to order; demand is known from orders |
| Shipment delay risk | Remaining qty / recent output vs days left; TNA lag | Logistic regression or gradient boosting once outcomes are stored | Explain | **(1) now; (2) after 6+ months of stored predictions and outcomes** | No reliable labels today |
| Production completion | Qty left / EWMA of hourly output | Line-level regression with crew present, SMV, style | Planner narrative | **(1) + simple (2) EWMA** | Dense hourly data exists |
| Line efficiency | EWMA per line/style | Regression on SMV, crew, learning curve | None | **(1) / EWMA** | Cheap and explainable |
| Cash flow | Scheduled AR/AP + BTB maturities + payroll calendar | Seasonal model on monthly net cash | Narrative | **(1) for decisions; (2) for outlook only** | Scheduled flows are known; history is short |
| Payroll / attendance anomaly | Z-score and day-of-week rules | Isolation Forest later | HR explanation | **(1)** | Rules are explainable to HR and auditors |
| Order risk | Weighted score from TNA, material, production, payment signals | Calibrated classifier once outcomes exist | Briefing | **(1) -> (2)** | Start explainable; calibrate later |
| Supplier performance | OTD % and QC fail % scorecard | Survival model for lead time | Summary | **(1)** | Business wants a simple ranking |
| Attrition / turnover | Rule weights (exists) | Logistic regression on `EmployeeStatusHistory` | None | **(1); test (2) when 100+ leavers per tenant** | Small labelled sets per tenant |
| Document extraction | - | - | Multimodal model + schema validation | **(3)** | This is where LLMs clearly win |

**Overall:** rules and light statistics cover nearly everything with available data. LLMs should explain and extract. Trained ML is a later, data-gated step.

---

## 4. Evaluation metrics (how performance will be measured)

| Capability | Metric | Baseline to beat | Measured how |
|---|---|---|---|
| Completion / delay forecast | MAE in days between forecast and actual completion | "Planned date" as forecast | Store forecast daily; compare when order ships |
| Shortage alerts | Precision and recall of alerts vs actual stock-outs that stopped a line | Current reorder level alerts | Join alerts to zero-stock events |
| Demand forecast | MAPE / RMSE of daily OUT quantity | Moving average | Rolling-origin backtest |
| Order risk | AUC; precision@top-10 per week; Brier score for calibration | Overdue-only rule | Stored score vs late / on-time outcome |
| Cash forecast | MAE of monthly net cash; count of uncovered maturities missed | Last-month carry-forward | Monthly reconciliation |
| Anomaly rules | Alert acceptance rate (user marks useful); false-positive rate | - | `AiFeedback` + alert actions |
| Extraction | Field-level accuracy; % fields edited by user before save | Manual entry time | Log diff between extracted and saved values |
| LLM narratives | Factual consistency with the KPI table (automated check that every number in text exists in the data) | - | Eval harness (doc 07) |

No accuracy numbers exist today, and none are claimed in this document.

---

## 5. Model lifecycle (when ML is introduced)

1. **Data readiness gate:** per tenant, at least 6-12 months of the relevant series and at least a few hundred labelled outcomes. Otherwise stay with rules.
2. **Prediction log first:** add a generic `ai_prediction_log` table (tenant_id, capability, entity_type, entity_id, predicted_at, prediction_json, outcome_json, outcome_at). This is additive and reversible. It is the foundation for every metric above and costs little.
3. **Training:** offline Celery job per tenant using `pandas` / `scikit-learn` / `statsmodels`; store metadata in the existing `AiForecastModel` table.
4. **Evaluation:** rolling-origin backtest; promote a model only if it beats the rule baseline on the metric in section 4.
5. **Serving:** batch predictions written nightly; API reads stored results (no model inference in the request path).
6. **Drift monitoring:** weekly comparison of recent error vs backtest error; fall back to rules automatically if error worsens beyond a threshold.
7. **Retraining:** monthly or on drift; tenant feature flag controls rule vs model.

---

## 6. Feasibility verdict

| Question | Answer |
|---|---|
| Can Prime7 support predictive analytics now? | Yes, with rules and simple statistics on existing data |
| Can it support trained ML now? | Not reliably - labels and outcome logging are missing |
| What unlocks ML? | Prediction-outcome log, status history, and 6-12 months of consistent data per tenant |
| What should LLMs do? | Extraction, explanation, summarisation, routing - never numeric truth |
