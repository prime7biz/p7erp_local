# Phase 16 — Document AI (validation)

## Scope

- Compare **extracted** field values from LC/PI/invoice flows to **existing** ERP rows for whitelisted keys only.
- **Mismatch detection only** — no posting or auto-correction.

## Architecture

- Service: `backend/app/modules/erp_ai_phases/document_ai_service.py`
- Route: `POST /api/v1/erp-ai/document/validate`
- Supported entities: `order`, `quotation`, `customer` (field allowlists inside the service).

## Rules

- Global: `DOCUMENT_AI_VALIDATION_ENABLED` (default `false`).
- Tenant override: `feature_flags.document_ai_validation_enabled`.

## Limitations

- Only compares keys present in both extraction payload and allowlist; types normalized via string comparison.

## Test commands

```bash
docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
```
