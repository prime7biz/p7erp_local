# 03 — KPI Engine Architecture (v1)

## Decision

Governed **KPI registry + computation services on operational Postgres**. Flag `kpi_engine_v1` (strict default OFF). No separate OLAP/EPCIS warehouse in v1.

## Package layout

```
backend/app/modules/kpi_engine/
  __init__.py
  models.py              # SQLAlchemy models for registry tables
  schemas.py
  router.py              # /api/v1/kpi/*
  registry_service.py
  target_service.py
  compute_base.py        # KpiValue dataclass
  seed.py                # Idempotent definition seed
  security.py            # Sensitivity + permission gate
  adapters/              # Wrappers over MI / finance / merch / HR
  compute/               # NEW formulas (Tier-1 waves)
  evidence_service.py
  recalc_service.py
  predictive_service.py  # Phase K
backend/app/workers/kpi_daily_worker.py  # Phase J
backend/app/models/kpi_engine.py         # re-export / table models
```

## Schema (migration 314+, RLS on all)

| Table | Purpose |
|---|---|
| `kpi_definitions` | code, name, module, metric_type KPI\|DIAGNOSTIC, tier, formula fields, unit, direction, grain, cadence, owner_role, applicability F/A/B JSON, sensitivity, active, version |
| `kpi_definition_versions` | immutable history of definition changes |
| `kpi_source_mappings` | kpi_id → source_fact_key / adapter_key |
| `kpi_targets` | scoped targets + target_type enum + citation JSON |
| `kpi_thresholds` | amber/red bands |
| `kpi_results` | daily materialised value (tenant, kpi, date, dim_key, num, den, value, status, freshness, computation_version) |
| `kpi_alerts` | optional bridge rows or foreign keys to existing alert engines |
| `kpi_recalculation_jobs` | partition jobs |
| `kpi_data_quality_results` | DQ outcomes |
| `order_commitment_revisions` | C2 append-only commitment history |
| `kpi_predictions` | K: model_version, features, outcome |

Unique: `(tenant_id, kpi_code)` on definitions; `(tenant_id, kpi_id, result_date, dim_key, computation_version)` on results.

## Computation contract

```python
@dataclass
class KpiValue:
    code: str
    value: Decimal | None
    unit: str
    as_of: datetime
    formula_version: str
    numerator: Decimal | None
    denominator: Decimal | None
    status: str  # GREEN|AMBER|RED|NO_DATA|NO_TARGET
    missing_inputs: list[str]
    source_event_time: datetime | None
```

Prefer **ADAPT** existing services; never duplicate formulas in React.

## Security matrix

| Sensitivity | Who (authority classes ON) | Who (authority classes OFF — soft RBAC fallback) |
|---|---|---|
| OPERATIONAL | Module grant + Class 2–4 in module | Module access via existing soft keys / admin\|manager |
| MANAGEMENT | Module + Class 2+ | admin\|manager or explicit module manage key |
| CONFIDENTIAL | Class 1 / Super / fail-closed finance keys | Fail-closed: admin\|manager **or** exact `true` on finance keys — no missing-key allow |
| HIGHLY_CONFIDENTIAL | Super / Class 1 policy-only | Same as CONFIDENTIAL + Super |

**Named permission keys (register in `permissions.py`):**
- `kpi.read` — list definitions, cards, values, evidence (operational)
- `kpi.executive.view` — executive cockpit (management+)
- `kpi.manage` — seed/admin of definitions (settings/admin)
- Reuse fail-closed `finance.mis_report.view` / `finance.mgmt_performance.view` / `production.planning.read` when the adapter source requires them.

Cover every KPI route in `tests/test_route_permission_inventory.py`. Server-side filter in one dependency. Tenant isolation via `tenant_id` + RLS. UI hide ≠ control.

## Finance / commercial adapter boundaries

- Adapters call **public read** services only. Never mutate `finance/**`, never post/reverse vouchers, never change inventory valuation (mirror MI Phase 3).
- COM-01 PI↔Order link table has **no `tenant_id`**: any join must go through parent PI/Order with `ensure_owned` / tenant filter on the parent — never join-only on the link table.
- List/evidence APIs capped at `MAX_PAGE_SIZE`. Daily recompute partitions bounded by (tenant, kpi, date). Avoid unbounded stock scans before Phase J aggregates.

## Recalculation

On approved historical correction (Phase G): enqueue job for affected `(tenant, kpi, date_from, date_to)` only. Closed periods: adjustment in open period or existing reopen procedure — never silent rewrite.

`kpi_daily_worker` (Phase J): loop tenants with `bind_session_tenant(db, tenant_id)` each iteration; use `run_async` from `workers/async_runner.py`; fail closed (log + skip).

## API (flag gated)

- `GET /kpi/definitions`
- `GET /kpi/definitions/{code}`
- `GET /kpi/cards?dashboard=`
- `GET /kpi/{code}/value`
- `GET /kpi/{code}/evidence`
- `GET /orders/{id}/commitment-revisions` (C2)
- Predictive routes under `/kpi/predictive/*` (K)

## Rollback

Flag OFF restores prior behaviour. `alembic downgrade` drops new tables after export.

## Non-goals v1

No factory master, no full star schema, no 192 KPIs, no overwrite of MI/Finance CT UIs, no industry-benchmark defaults.
