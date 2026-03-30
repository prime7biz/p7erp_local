# Phase 18 — Executive AI dashboard

## Scope

- Read-only **snapshot**: orders/quotations totals, finance workflow queue depth, bank recon backlog, plus **risk** and **opportunity** heuristics.

## Architecture

- Service: `backend/app/modules/dashboard/executive_ai_brief_service.py`
- Route: `GET /api/v1/dashboard/ai/executive-brief`

## Rules

- Global: `EXECUTIVE_AI_DASHBOARD_ENABLED` (default `false`).
- Tenant override: `feature_flags.executive_ai_dashboard_enabled`.

## Limitations

- Heuristic thresholds (e.g. vouchers in workflow > 20) — tune per business later.

## Test commands

```bash
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
