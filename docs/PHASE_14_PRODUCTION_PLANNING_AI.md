# Phase 14 — Production planning AI (enhanced, advisory)

## Scope

- Deterministic **capacity proxy** per sewing line and **sequencing hints** from the line plan board window.
- **No mutations** to `sewing_line_style_configs` or orders.

## Architecture

- Service: `backend/app/modules/production/planning_advisory_service.py`
- Route: `POST /api/v1/production/planning/advisory/capacity-sequencing` (`planning_router.py`)
- Audit: `PRODUCTION_PLANNING_ADVISORY` via `app.modules.ai_tool.audit.log_ai_event`

## Rules

- Global: `PRODUCTION_PLANNING_AI_ENHANCED_ENABLED` (default `false`).
- Tenant override: `feature_flags.production_planning_ai_enhanced_enabled` (explicit `false` disables).

## Limitations

- Utilization is a **rough proxy** (machines × operators × shift minutes × working days vs remaining planned quantity). Confirm with IE/SMV and floor data.

## Test commands

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
