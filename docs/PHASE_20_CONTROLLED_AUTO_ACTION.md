# Phase 20 — Controlled auto-action

## Scope

- **Persist** rule-based automation **proposals**, optional idempotency, **approve / reject / rollback** markers.
- **No automatic execution** of business side-effects in these routes — execution remains a separate controlled job.

## Architecture

- Table: `ai_controlled_action_proposals` (Alembic `139_ai_controlled_action_proposals.py`)
- Rule definitions: existing `ai_automation_rules` (Alembic `049`) extended with `description` + `condition_json` (Alembic `140`) for JSON condition evaluation; model: `app.models.ai_tool.AiAutomationRule` (re-exported from `app.models`). Phase 20 uses `is_enabled` as the active flag.
- Model: `app.models.ai_controlled_action.AiControlledActionProposal`
- Service: `backend/app/modules/erp_ai_phases/governance_service.py`
- Routes: `POST /api/v1/erp-ai/governance/proposals`, `.../approve`, `.../reject`, `.../rollback` (`erp_ai_phases/router.py`; approve/reject/rollback require **admin** role)

## Rules

- Global: `AI_CONTROLLED_AUTOMATION_ENABLED` (default `false`).
- Tenant override: `feature_flags.ai_controlled_automation_enabled`.

## Limitations

- Approval does not run ERP mutations; wire executors with full audit and rollback separately.

## Test commands

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
