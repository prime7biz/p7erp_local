# Phase 19 — AI Copilot (read-only)

## Scope

- **Whitelisted intents** mapping to fixed, tenant-scoped queries — no arbitrary SQL or writes.

## Architecture

- Service: `backend/app/modules/erp_ai_phases/copilot_service.py` (`ALLOWED_INTENTS`)
- Route: `POST /api/v1/erp-ai/copilot/safe-query` body `{ "intent": "..." }`

## Rules

- Global: `AI_COPILOT_READONLY_ENABLED` (default `false`).
- Tenant override: `feature_flags.ai_copilot_readonly_enabled`.

## Limitations

- Intents: `orders_open_count`, `quotations_draft_count` — extend deliberately with new keys and tests.

## Test commands

```bash
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
