# 09 - Technical architecture

## 1. Confirmed stack

FastAPI + SQLAlchemy async + PostgreSQL (RLS opt-in), Redis (Celery broker, rate limits, caches), Celery worker +
beat, React + TypeScript + Vite, Docker. Optional AI: OpenRouter / Gemini via `generate_text_for_tenant`.

## 2. Package layout

```text
backend/app/modules/mfg_intelligence/        # read model; owns no transactional writes
  __init__.py
  router.py              # GET endpoints, flag + permission guard
  schemas.py             # Pydantic response models (decimal strings)
  flags.py               # strict tenant flag helpers
  confirmed_demand.py    # owner rule: status NEW / CONFIRMED / IN_PROGRESS
  calendar_helpers.py    # working days, shift minutes (wraps production.calendar_service)
  capacity_service.py    # corrected capacity per line-day
  legacy_comparison.py   # read-only reproduction of the legacy advisory formula
  line_loading_service.py
  readiness_service.py
  delivery_service.py
  summary_service.py

frontend/src/
  api/manufacturingIntelligence.ts
  hooks/useManufacturingIntelligence.ts
  components/control-tower/intelligence/
    CapacityComparisonPanel.tsx
    LineLoadingPanel.tsx
    ReadinessPanel.tsx
    DeliveryRiskPanel.tsx
  pages/app/operations/ControlTowerPage.tsx   # extended
```

Why a new package: the calculation joins production, merchandising, inventory and (later) HR and finance. Putting it
in any one owning module would create circular imports; `control_tower` stays the thin UI-facing shell.

## 3. Phase 1 rules

- GET only. No migration. No `db.add`, `flush`, `commit`; no call to `auto_advance_order_pipeline`,
  `maybe_sync_followup` or `line_reservation_service`.
- Router dependency `require_internal_permission("production.planning.read")` (counted by
  `tests/test_route_permission_inventory.py`; never added to `ALLOWED_WITHOUT_MODULE_KEY`).
- Every endpoint: `require_tenant`, user / tenant match, flag `manufacturing_intelligence_v1` strict true else 404.
- Order id path parameters are looked up with `tenant_id` filter; other tenants' ids return 404 "Order not found".
- Date window max 180 days; line lists bounded; batch queries (no per-row queries in loops over BOM lines).
- Quantities and minutes returned as decimal strings with fixed rounding.

## 4. Flags (strict `true`, default OFF, not in `DEFAULT_ON_FEATURE_FLAGS`)

| Flag | Effect |
|---|---|
| `manufacturing_intelligence_v1` | Enables the router and Control Tower panels |
| `planning_math_v2` | Includes corrected values next to legacy values (otherwise legacy only plus notice) |
| `mfg_order_bom_readiness_v2` | Readiness uses active Order BOM; otherwise legacy style-BOM readiness |

## 5. API inventory

### Phase 1 (read-only)

| Method | Path (`/api/v1` prefix) | Permission | Flag |
|---|---|---|---|
| GET | `/mfg-intelligence/summary?date_from&date_to&factory_unit` | `production.planning.read` | `manufacturing_intelligence_v1` |
| GET | `/mfg-intelligence/capacity?date_from&date_to&factory_unit&line_id` | same | same (+ `planning_math_v2` for corrected) |
| GET | `/mfg-intelligence/line-loading?date_from&date_to&factory_unit&line_id` | same | same |
| GET | `/mfg-intelligence/orders/{order_id}/readiness` | same | same (+ `mfg_order_bom_readiness_v2`) |
| GET | `/mfg-intelligence/orders/{order_id}/delivery-prediction` | same | same |

### Later phases

| Phase | Method / path | Permission | Flag |
|---|---|---|---|
| 2 | POST `/mfg-intelligence/scenarios/simulate` | `production.planning.write` | `mfg_integrated_planning_v1` |
| 2 | POST `/mfg-intelligence/scenarios/{id}/confirm` | `production.planning.approve` | same |
| 2 | POST `/mfg-intelligence/orders/{id}/materials/allocate-preview` | `inventory.items.read` | `mfg_material_allocation_v1` |
| 2 | POST `/mfg-intelligence/orders/{id}/materials/allocate-confirm` | `inventory.items.approve` + governance key | same |
| 2 | POST `/mfg-intelligence/reservations/{id}/release` | `production.planning.approve` | same |
| 2 | Assignment CRUD (employee / machine to line) | `production.planning.write` / `approve` | `mfg_integrated_planning_v1` |
| 3 | GET `/mfg-intelligence/orders/{id}/cost` | `mfg_intelligence.finance.view` (fail-closed) | `mfg_cost_intelligence_v1` |
| 3 | GET `/mfg-intelligence/cash-requirement` | same | `mfg_financial_readiness_v1` |
| 4 | GET `/mfg-intelligence/recommendations`, POST `/{id}/decision` | source key + `ai.agents.confirm` | `mfg_predictive_intelligence_v1` |
| 5 | POST `/mfg-intelligence/optimize/simulate`, `/confirm` | planning write / approve | `mfg_optimization_v1` |

## 6. Proposed database changes by phase

| Phase | Change | Type | RLS |
|---|---|---|---|
| 1 | None | - | - |
| 2 | `stock_reservations`: `reservation_kind`, `reservation_source`, `expires_at`, `bom_item_id`, `lock_version` | nullable columns | existing |
| 2 | `sewing_line_style_configs`: `inquiry_id`, `quotation_id`, `demand_class`, `confidence_pct`, `expires_at`, `schedule_version`, `lock_version`, `source_smv_type` | nullable columns | existing |
| 2 | `followup_action_templates`: product type, sourcing mode, route code, gate class, predecessors, lag; `order_followup_actions`: route provenance | nullable columns | existing |
| 2 | `garment_styles.standard_smv` (+ source, confidence, approved_by, updated_at) | nullable columns | existing |
| 2 | `mfg_material_supply_peggings` | new table | same migration |
| 2 | `mfg_plan_revisions`, `mfg_plan_revision_items` | new tables | same migration |
| 2 | `production_employee_line_assignments`, `production_machine_line_assignments` | new tables | same migration |
| 2 | Optional `orders` target shipment / buyer delivery dates (owner approval) | nullable columns | existing |
| 4 | `ai_agent_decisions` recommendation / outcome fields | nullable columns | existing |
| 5 | Optional `mfg_planning_snapshots`, `mfg_dirty_entities` (only after measured need) | new tables | same migration |

All migrations: additive, nullable first, working `downgrade()`, no DROP / rename, NOT NULL only in a later revision.

## 7. Cost classification (Phase 3)

Every amount is labelled POSTED (in-books voucher, base currency), ACCRUED, ALLOCATED (e.g. FIFO material issue),
ESTIMATED or FORECAST, with FX lineage (source amount, currency, rate, rate date, source). No voucher is created.
`forecast_cost_to_complete = posted + accrued + allocated_unposted + estimated_remaining (material, labour, overhead) + expected finance / logistics`;
each cost fact has one classification so nothing is counted twice.

## 8. Performance and observability

- Phase 1: 180 days x lines computed in memory per request; queries batched per entity type.
- Structured log line per request with tenant id, endpoint, duration, line and day counts (no sensitive payload).
- Phase 2+: Redis cache 1-5 minutes keyed by tenant, permission scope and filters; never shared across permission scopes.

## 9. Lineage tags

`SOURCE` (direct fact), `CALCULATED` (deterministic), `PREDICTED` (statistical / band), `AI_TEXT` (LLM explanation).
