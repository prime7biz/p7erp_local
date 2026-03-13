# Manufacturing Module Architecture (Phase-1 Start)

This document defines the new advanced Manufacturing domain for P7 ERP.

## Goal

Build Manufacturing as a dedicated domain while keeping existing `inventory` manufacturing endpoints running during transition.

## Bounded Contexts

1. Master Data
   - Work centers
   - Operations
   - Routing templates and routing steps
2. Planning
   - Production plans
   - Plan lines
   - Generate work orders from plans
   - MRP runs and recommendations
   - Capacity load view
3. Execution
   - Work order lifecycle
   - Operation-level execution
   - Material issue and return
   - Operator assignment by operation
   - Downtime event tracking
   - OEE-like KPI dashboard
4. Quality
   - In-process and final quality checks
   - NCR (non-conformance report)
   - CAPA workflow
5. Costing Hooks
   - Actual material/labor/overhead capture
   - Cost snapshot and variance tracking

## Backend Structure

- Models: `backend/app/models/manufacturing.py`
- Routers:
  - `backend/app/modules/manufacturing/master_data_router.py`
  - `backend/app/modules/manufacturing/planning_router.py`
  - `backend/app/modules/manufacturing/execution_router.py`
  - `backend/app/modules/manufacturing/quality_router.py`
  - `backend/app/modules/manufacturing/costing_hooks_router.py`
- Router aggregator:
  - `backend/app/modules/manufacturing/router.py`
- Migration:
  - `backend/alembic/versions/034_manufacturing_advanced_foundation.py`

## API Prefixes

All routes use `/api/v1` + the module prefix:

- `/manufacturing/master/*`
- `/manufacturing/planning/*`
- `/manufacturing/execution/*`
- `/manufacturing/quality/*`
- `/manufacturing/costing/*`

### Newly added advanced planning endpoints

- `POST /manufacturing/planning/mrp/runs`
- `GET /manufacturing/planning/mrp/runs/{run_id}/recommendations`
- `GET /manufacturing/planning/capacity/loads`

### Newly added shop-floor and quality endpoints

- `GET /manufacturing/execution/operations/queue` (supports `area=cutting|sewing|finishing`)
- `POST /manufacturing/execution/operations/assignments`
- `POST /manufacturing/execution/operations/downtime`
- `GET /manufacturing/execution/operations/downtime`
- `POST /manufacturing/execution/operations/downtime/{downtime_id}/end`
- `POST /manufacturing/execution/operations/{operation_id}/hold`
- `POST /manufacturing/execution/operations/{operation_id}/resume`
- `GET /manufacturing/execution/dashboard`
- `GET /manufacturing/execution/dashboard/downtime-reasons` (optional query: `start_date`, `end_date`)
- `GET /manufacturing/execution/dashboard/downtime-trend` (optional query: `start_date`, `end_date`; daily buckets)
- `GET /manufacturing/quality/ncrs`
- `POST /manufacturing/quality/ncrs`
- `POST /manufacturing/quality/ncrs/{ncr_id}/status`
- `GET /manufacturing/quality/capas`
- `POST /manufacturing/quality/capas`
- `POST /manufacturing/quality/capas/{capa_id}/status`

### Workflow safeguards

- Only one open downtime event is allowed per operation at a time.
- Operation queue area filtering first uses explicit operation master `process_area` (`cutting|sewing|finishing|general`), then fallback inference.
- Reopen action for NCR/CAPA requires a note.
- NCR/CAPA status notes are appended as lightweight audit text in description/closure_note.
- Role controls:
  - Operator/Supervisor/Manager/Admin can run operation actions and log downtime.
  - Supervisor/Manager/Admin can assign operations and close downtime events.
- Frontend IE screen (`/app/production/ie`) can maintain operation `process_area` mapping.

## Database Naming

- New tables use `mfg_` prefix for clear separation and clean directory structure.
- Every manufacturing table is tenant-scoped with `tenant_id`.
- Business keys are unique per tenant (for example, `tenant_id + mo_number`).

## Transition Strategy

1. Keep current `inventory` manufacturing endpoints stable.
2. New UI and flows should gradually move to `/manufacturing/*`.
3. Later phases can add:
   - Advanced quality workflows (NCR/CAPA)
   - Finance auto-posting integration
   - Detailed machine-level finite scheduler and calendar constraints
