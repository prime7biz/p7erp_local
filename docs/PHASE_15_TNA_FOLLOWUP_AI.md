# Phase 15 — TNA / follow-up AI

## Scope

- **Overdue** open actions (merch follow-ups + manufacturing TNA tasks), **unassigned** open actions, heuristic **delay risk score**, and alert objects.
- Read-only — no status or date writes.

## Architecture

- Service: `backend/app/modules/tna_unified/followup_ai_service.py`
- Route: `GET /api/v1/tna-unified/ai/followup-insights?order_id=optional`
- Audit: `TNA_FOLLOWUP_AI_INSIGHTS`

## Rules

- Global: `TNA_FOLLOWUP_AI_ENABLED` (default `false`).
- Tenant override: `feature_flags.tna_followup_ai_enabled`.

## Limitations

- Risk score is a **heuristic** (weighted counts), not a forecast model.

## Test commands

```bash
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
