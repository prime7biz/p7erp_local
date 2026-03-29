# Order planning simulation & guarded what-if (production notes)

## Scope

Read-only planning intelligence on **orders**: capacity overlap heuristics, hypothetical delivery/qty stress on ATP/CTP, promise-date sensitivity grids, and a deterministic execution planning summary. **No** automatic changes to shipment dates, ex-factory dates, allocations, production plans, order status, materials, or costing.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/orders/ai/capacity-bottleneck-scan` | Line-board overlap heuristic for `sewing_line_style_configs` linked to the order |
| POST | `/api/v1/orders/ai/what-if-simulation` | Shift delivery (days), optional quantity scale, optional capacity load factor — compares baseline vs simulated promise check in memory |
| POST | `/api/v1/orders/ai/promise-sensitivity-check` | Grid of ATP/CTP vs delivery date offsets |
| POST | `/api/v1/orders/ai/planning-summary` | Deterministic execution planning summary (distinct from LLM `POST /summary`) |
| POST | `/api/v1/orders/ai/next-actions` | Unchanged; still trace + optional planning context |
| GET | `/api/v1/orders/ai/simulation-audit-log` | Filtered audit rows for simulation actions only |

List/detail **indicators** (`ai_indicators=1`): adds `capacity_bottleneck_flag`, `bottleneck_severity_score`, `promise_sensitivity_score` (batched layout row counts on list).

## Trace batch `action_type` values

- `capacity_bottleneck_scan`
- `what_if_simulation`
- `promise_sensitivity_check`
- `planning_summary` (execution summary — not the LLM `summary` trace)

## RBAC (`roles.permissions`)

Missing key ⇒ allow (same convention as other order AI). Explicit `false` denies.

| Capability (internal) | Permission key |
|----------------------|----------------|
| `capacity_bottleneck_scan` | `orders.ai.capacity_bottleneck_scan` |
| `what_if_simulation` | `orders.ai.what_if_simulation` |
| `promise_sensitivity_check` | `orders.ai.promise_sensitivity_check` |
| `execution_planning_summary` | `orders.ai.execution_planning_summary` |
| `simulation_audit` | `orders.ai.simulation_audit` |

Admin/manager/owner-style roles bypass granular checks.

## Safety

- Simulation endpoints **do not** `UPDATE` orders, plans, or inventory.
- `run_order_promise_check` supports optional `delivery_date_override` / `quantity_override` for analysis only.
- Audit + `order_ai` suggestion batches record traces; payloads are capped in batch metadata.

## Limitations

- Not an APS/finite-capacity optimizer; overlap logic is **date-range overlap** on sewing line configs.
- ATP/CTP remains the existing deterministic BOM/stock model; weak master data yields weaker signals (explicitly surfaced in responses).

## Tests (Docker)

```bash
docker compose exec backend pytest tests/test_order_simulation_ai_integration.py -q
```

## Recommendation: costing AI

Defer **advanced costing AI** until planning maturity is higher (reliable capacity models, actuals vs plan variance, and change-control on commercial data). This phase intentionally stays advisory and read-only so teams can trust signals before automation.
