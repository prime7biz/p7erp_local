# Merch Workflow Rollout Checklist

This document tracks cross-cut migration, validation, and release controls for the workflow phases implemented in backend/frontend.

## Scope covered

- Lifecycle transition guardrails for inquiry/quotation/order.
- Unified TNA adapter endpoints (`/api/v1/tna-unified/*`).
- BOM governance and freeze controls (approved/frozen only for downstream use).
- Decimal-safe quotation costing aggregation.
- Auto-generation of follow-up actions when order enters committed states.
- ATP/CTP promise check endpoint and enforcement on order status progression.
- Alert center enrichment (`priority_score`, `sla_bucket`) and alert rule cleanup.
- Consumption plan controls (BOM-driven creation; manual line override blocked).

## Tenant rollout strategy

Use phased rollout per tenant to reduce risk:

1. Pilot tenant (internal/UAT)
2. One buying-house tenant
3. One manufacturing tenant
4. Remaining tenants in batches

## Pre-release checks

- Backend compiles without syntax errors:
  - `python -m compileall backend/app`
- Frontend build succeeds:
  - `npm run build` (inside `frontend/`)
- Database migrations (if any) are applied in staging before production.

## API smoke verification script

Use this script before tenant-by-tenant rollout to quickly validate key merchandising workflow APIs:

- Script path: `backend/scripts/verify_merch_workflow_api.py`
- Run:
  - `python scripts/verify_merch_workflow_api.py`
- Optional environment variables:
  - `UAT_API_BASE_URL` (default `http://localhost:8000`)
  - `UAT_TENANT_CODE`
  - `UAT_USERNAME`
  - `UAT_EMAIL`
  - `UAT_PASSWORD`

What it verifies:

- Login using company code + username/email.
- Tenant header mismatch protection.
- Inquiry/Quotation/Order list endpoints and `next_status_options` presence.
- Order promise-check endpoint.
- Unified TNA summary/actions endpoints.
- BOM list endpoint.
- Alerts API advanced filtering/sorting (`min_priority_score`, `sla_bucket`, `sort=-priority_score`) and alert detail enrichment.

## DB integrity verification script

Use this script for tenant data-integrity checks before release sign-off:

- Script path: `backend/scripts/verify_merch_workflow_db.py`
- Run:
  - `python scripts/verify_merch_workflow_db.py`
- Optional environment variable:
  - `UAT_TENANT_CODE` (default `LAKHSMA4821`)

What it verifies:

- Workflow status values are valid for inquiry/quotation/order/BOM records.
- Converted/committed linkage sanity (quotation and order references).
- Committed orders (`NEW`, `IN_PROGRESS`) have follow-up action coverage.
- Consumption plans map to styles that have governed BOM (`APPROVED`/`FROZEN`).
- Alert severity values are from the supported set.
- Unified TNA readiness counts from both merch and manufacturing task tables.

## One-command release check

For final tenant go/no-go, run the combined checker:

- Script path: `backend/scripts/verify_merch_workflow_release.py`
- Run:
  - `python scripts/verify_merch_workflow_release.py`

This runs both:

- `verify_merch_workflow_api.py`
- `verify_merch_workflow_db.py`
- `verify_merch_workflow_transitions_api.py`

and prints one final line:

- `GO-LIVE CHECK: PASS` or `GO-LIVE CHECK: FAIL`

## UAT checklist (minimum)

### 1) Lifecycle transitions

- Inquiry:
  - `DRAFT -> SUBMITTED` succeeds
  - Invalid jump (e.g. `DRAFT -> CONVERTED`) is blocked
- Quotation:
  - `DRAFT/NEW -> SUBMITTED -> APPROVED -> SENT`
  - Invalid direct jump is blocked
- Order:
  - `DRAFT -> NEW -> IN_PROGRESS -> COMPLETED`
  - Invalid direct jump is blocked

### 2) BOM governance

- BOM item edits are blocked when BOM is `APPROVED` or `FROZEN`.
- Purchase order generation from BOM only works for `APPROVED/FROZEN` BOM.
- Material requirement and wastage/reconciliation calculations select governed BOM.

### 3) TNA

- Existing merch follow-up and manufacturing TNA data both appear in unified endpoint:
  - `GET /api/v1/tna-unified/actions`
  - `GET /api/v1/tna-unified/summary`
- Order entering `NEW` or `IN_PROGRESS` auto-creates follow-up actions once.

### 4) ATP/CTP guard

- `GET /api/v1/orders/{id}/promise-check` returns ATP/CTP result with reason lines.
- Transition to `IN_PROGRESS` is blocked if promise check fails.

### 5) Alerts

- Alert list/detail include:
  - `priority_score`
  - `sla_bucket`
- Alert scan still runs and opens/updates instances correctly.

## Production release order

1. Deploy backend first.
2. Validate health endpoint and key API smoke tests.
3. Deploy frontend.
4. Execute targeted UAT flows for one tenant.
5. Expand to remaining tenants.

## Rollback notes

- If rollout issue appears:
  - Keep data intact.
  - Revert application release to previous image/tag.
  - Re-run smoke tests.
- Do not delete tenant transactional data as rollback strategy.

