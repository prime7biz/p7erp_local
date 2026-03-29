# Order Planning AI (ATP/CTP Alignment) — Production

## Scope (Phase 1: Read-only)

This phase adds planning intelligence to orders so merchandising and planning teams can decide whether an order is realistically executable and promiseable.

It is **read-only on business workflow**:

- No auto change to shipment/delivery dates
- No auto change to order status
- No auto allocation of line capacity
- No auto creation of production plans
- No auto costing updates
- No auto material reservation changes

What it does:

- Validate execution readiness
- Check planning risk with deterministic factors
- Provide ATP/CTP summary
- Generate next-action recommendations
- Persist trace + audit rows for accountability

## Reuse Map

| Layer | Reused pattern | Implementation |
|---|---|---|
| Trace/audit architecture | Order AI trace batch + `AiAuditLog` | `backend/app/modules/orders/order_ai_batches.py`, `order_ai_service.py` |
| RBAC | `orders.ai.*` capability pattern | `backend/app/modules/orders/order_ai_authz.py` |
| Router shape | `/api/v1/orders/ai/*` | `backend/app/modules/orders/order_ai_router.py` |
| Request correlation + rate-limit | master_data_ai trace dependency | existing dependencies on router endpoints |
| Deterministic ATP/CTP core | existing promise check logic | shared helper `backend/app/modules/orders/promise_checks.py` |

## Endpoints

Under `/api/v1/orders/ai`:

- `POST /validate-execution`
- `POST /planning-risk-check`
- `POST /atp-ctp-summary`
- `POST /next-actions` (`include_planning_context` optional)
- `GET /planning-audit-log`
- Existing: `GET /audit-log?surface=planning`

All responses are bounded structured payloads and include `suggestion_batch_id` where trace rows are recorded.

## Indicators (Order list/detail)

`OrderAiIndicatorsOut` now includes:

- `execution_readiness_score`
- `material_readiness_score`
- `planning_confidence_score`
- `promise_date_risk_score`
- `missing_dependency_count`
- `urgent_planning_flag`
- existing `completeness_score`, `duplicate_risk_score`, `flags`

These indicators are advisory and do not block workflow transitions by themselves.

## Safety Rules

1. Planning AI writes only trace/audit metadata, not order/planning business fields.
2. Existing workflow gates remain source of truth (for example IN_PROGRESS transition still relies on deterministic promise checks).
3. Structured outputs are bounded and sanitized before persistence.
4. Tenant isolation is enforced for every order id lookup.
5. Planning audit surface can be filtered independently for operational review.

## RBAC Keys

In addition to existing Order AI keys:

- `orders.ai.validate_execution`
- `orders.ai.planning_risk_check`
- `orders.ai.atp_ctp_summary`
- `orders.ai.planning_audit`

Missing key => allowed by current policy. Explicit `false` denies.

## Frontend Surfaces

- `OrderDetailPage`: planning-aware metrics and read-only planning checks in Order AI panel
- `OrdersPage`: compact planning indicators (`M%`, `P%`, missing deps, urgent planning)
- Planning audit history shown via `OrderAiAuditHistory` in planning mode

## Test Commands

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m pytest tests/test_order_ai_integration.py -v
docker compose exec backend python -m pytest tests/test_order_planning_ai_integration.py -v
```

## Known Limitations

- ATP uses current stock movement and approved/frozen BOM, not full APS optimization.
- CTP is still date-feasibility-oriented and not full finite-capacity scheduling.
- Planning risk is deterministic/rules-first in this phase.
- AI next-actions are recommendations only; manual execution remains required.

## Next After This Phase

Recommended next step is **deeper production-planning intelligence** (line-capacity and bottleneck simulation with guarded what-if views) before advanced costing AI, unless finance explicitly prioritizes costing automation first.
