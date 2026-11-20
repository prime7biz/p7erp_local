# 06 — Implementation notes (2026-11-19)

## Delivered

- Docs Phase A–B under this folder.
- Migration `314` (RLS): registry tables, `order_commitment_revisions`, `kpi_predictions`.
- Flags: `kpi_engine_v1`, `kpi_predictive_v1` (strict OFF).
- Permissions: `kpi.read`, `kpi.executive.view`, `kpi.manage`.
- Package `backend/app/modules/kpi_engine/` with seed, compute adapters (Tier-1), evidence, recalc, predictive.
- Order PATCH write-through (nested savepoint) for commitment history when flag ON.
- Celery task `kpi.daily_aggregate` + beat entry.
- UI `/app/kpi` + Settings switches + Help article `kpi-engine-cockpit`.
- Tests: `backend/tests/test_kpi_engine.py` (12 passed).
- Reconcile script: `docker compose exec backend python scripts/kpi_reconcile_report.py --tenant-id <id>`.

## How to enable locally

1. `docker compose exec backend alembic upgrade head`
2. Settings → Configuration → enable **KPI engine**
3. Open `/app/kpi` → **Seed definitions**
4. Optional: backfill commitments via `POST /api/v1/kpi/orders/commitment-revisions/backfill`

## Honest gaps still labelled NO_DATA / BLOCKED

- QA-01 / QA-02 until QA-04 QC hardening.
- Several adapters return explicit `missing_inputs` until source facts mature.
- OTIF uses `LATEST_DATE_BASIS` until revisions exist.
- Factory scope remains free-text `factory_unit` only.

## Rollback

Flag OFF; `alembic downgrade 313` after exporting KPI rows.
