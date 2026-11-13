# 07 - AI prediction and recommendation

## 1. Layers (deterministic first)

| Layer | Role | Phase |
|---|---|---|
| Business rules | Gates, confirmed demand, booking classes | 1 |
| Deterministic scheduling | Capacity, load spreading, remaining duration, delivery ranges | 1 |
| Statistics | Empirical line output, supplier lateness percentiles, absence rate | 4 |
| Anomaly detection | Output drops, rejection spikes, ETA slippage | 4 |
| Optimization | Heuristic finite-capacity scheduler; optional CP-SAT | 5 |
| LLM | Plain-language explanation of deterministic results only | 4 |

The LLM never computes authoritative numbers, inventory or accounting, never chooses the final schedule and
never executes actions. Its text is tagged `AI_TEXT` and cannot overwrite `SOURCE`, `CALCULATED` or `PREDICTED`
values. If the LLM is down, every number is unchanged.

## 2. Delivery prediction (Phase 1 deterministic)

Target date: `Order.delivery_date` (= ex-factory, owner decision).

For each confirmed order:

1. `remaining_qty = max(0, order_qty - produced_qty)` where produced quantity comes from line plan
   `completed_qty` (summed over the order's line plan rows). Unknown when the order has no plan rows.
2. `daily_rate_likely` = sum over the order's firm / in-progress line plans of the corrected practical units per
   day for that line (section 3 of doc 04).
3. `start = max(today, earliest line plan start_date)`.
4. `likely_complete = start + ceil(remaining_qty / daily_rate_likely)` working days
   + finishing / QC buffer (tenant setting, default 0 working days in Phase 1 and shown as an assumption).
5. Optimistic uses rate x 1.10, pessimistic uses rate x 0.85 (Phase 1 fixed bands, shown as assumptions;
   Phase 4 replaces them with historical percentiles).
6. `delay_days = max(0, likely_complete - delivery_date)` in calendar days; `early_days` when negative.
7. Material not ready (blocking) pushes the start to UNKNOWN with reason `MATERIAL_NOT_READY` and the
   result becomes a range or UNKNOWN - never a precise date.

Risk band: `ON_TRACK` (likely <= target), `AT_RISK` (pessimistic > target >= likely), `LATE` (likely > target),
`UNKNOWN` (missing SMV, rate, plan or target).

## 3. Bottleneck detection (Phase 4, Phase 1 shows simple list)

Candidates: unapproved sample, pending lab dip, late yarn / fabric, knitting / dyeing backlog, trims delay,
material shortage, BTB LC pending, financing gap, machine breakdown, operator shortage, changeovers,
line imbalance, quality rejection, shipment documents.

Each finding carries: problem, affected orders, affected lines, root cause, estimated impact, severity,
responsible department, latest safe resolution date, recommended action, expected improvement.

Priority score: `severity x value_weight x delay_days x criticality x confidence`. The value weight is hidden from
users without finance permission. Only the top findings per department are raised, to avoid alert fatigue.

Phase 1 summary shows: overloaded lines, idle line-days, orders with blocking gates and late / at-risk orders.

## 4. Recommendation record (Phase 4)

Every recommendation stores: data snapshot reference, assumptions, confidence, financial impact (if calculable
and permitted), operational impact, recommended action, alternatives, department, deadline, approval
requirement, decision (accepted / rejected / expired), observed outcome. Storage: extend `ai_agent_decisions` with
nullable columns rather than a new table.

Example outputs (all generated from deterministic data):
- "Line 03 is expected to become idle in 6 days because its next allocated style is awaiting fabric approval."
- "Order Y is projected to miss its ex-factory date by 4 days unless dyeing completes earlier."

## 5. Data quality and fallbacks

| Missing input | Behaviour |
|---|---|
| SMV | Capacity and delivery UNKNOWN for that line / order; listed in `missing_inputs` |
| Shift | Capacity UNKNOWN (no 480-minute fallback) |
| Operators | Capacity UNKNOWN |
| Efficiency | Capacity UNKNOWN unless line plan has `target_efficiency_pct` |
| Order BOM | Material = STYLE_ESTIMATE (informational) |
| History | Deterministic only (`w = 0`) |
| Delivery date | Delivery risk UNKNOWN |
