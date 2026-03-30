# Phase 17 — Financial AI (read-only)

## Scope

- **Posted** voucher counts by calendar month (rolling window) and simple **volume anomaly** hints vs recent mean.

## Architecture

- Service: `backend/app/modules/finance/finance_ai_readonly_service.py`
- Route: `GET /api/v1/finance/ai/readonly-insights?months_back=6`

## Rules

- Global: `FINANCE_AI_READONLY_ENABLED` (default `false`).
- Tenant override: `feature_flags.finance_ai_readonly_enabled`.

## Limitations

- Not P&L, cash, or margin — counts and a single heuristic flag only.

## Test commands

```bash
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
