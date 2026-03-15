# Quality Module – QC Dashboard (Advanced)

The QC Dashboard is the main entry for the **Quality** module in P7 ERP. It provides a fully loaded overview of inspections, pass rates, NCR, CAPA, and defect trends.

## Route

- **Frontend:** `/app/quality/dashboard` (see `AppProtectedRouter.tsx`, sidebar **Quality → QC Dashboard**).
- **Backend:** `GET /api/v1/manufacturing/quality/dashboard`.

## Backend API

- **Module:** `backend/app/modules/manufacturing/quality_router.py`.
- **Endpoint:** `GET /manufacturing/quality/dashboard` (mounted under API v1 prefix).
- **Query params (optional):**
  - `date_from` (YYYY-MM-DD): filter by created_at from.
  - `date_to` (YYYY-MM-DD): filter by created_at to (end of day).

**Response:**

- `inspections`: `{ total, passed, failed, pass_rate }` (pass_rate 0–1).
- `by_check_type`: list of `{ check_type, total, passed, failed, pass_rate }`.
- `defect_distribution`: list of `{ defect_code, count }` (ordered by count desc).
- `recent_checks`: last 10 checks with `id`, `work_order_id`, `check_type`, `result`, `defect_code`, `created_at`.
- `capa`: `{ total, open, in_progress, closed }`.
- `ncr`: `{ total, open, closed }`.

Data is tenant-scoped. Quality checks, NCR, and CAPA come from `mfg_quality_checks`, `mfg_ncrs`, and `mfg_capas` (manufacturing quality submodule).

## Frontend Page

- **File:** `frontend/src/pages/app/manufacturing/QualityDashboardPage.tsx`.
- **API client:** `api.getQualityDashboard({ date_from?, date_to? })` in `frontend/src/api/client.ts`.
- **Types:** `QualityDashboardResponse` in `api/client.ts`.

## Dashboard Sections (Fully Loaded)

1. **Filters:** Date range (From / To), Refresh.
2. **KPI cards:** Total Inspections, Pass Rate (with bar), Pending CAPA, Open NCR, Defect Codes count.
3. **Recent Inspections:** Table (ID, WO, Type, Result, Defect, Date) with “View All” → `/app/quality/inspections`.
4. **Quick actions:** Links to Inspections, Lab Tests, CAPA, Returns.
5. **Pass/Fail by inspection stage:** Bar per `check_type` (e.g. in_process, final) with pass %.
6. **Defect distribution:** Top defect codes with counts.
7. **AI Quality Insights:** Placeholder for future AI recommendations.
8. **Quality Reports:** Placeholder cards (Quality Summary, Defect Analysis, Trend Report) for future export/generation.

## Related Routes (Quality Module)

- `/app/quality/inspections` – Inspections list and create.
- `/app/quality/lab-tests` – Lab tests.
- `/app/quality/capa` – CAPA actions.
- `/app/quality/returns` – Returns.
- `/app/quality/qc` – Legacy QC (currently points to inspections).

## Reference

- Parity and sidebar: `docs/REFERENCE_PARITY.md` (Quality section).
- Legacy reference: `replit-legacy/primeX-ERP` (QC dashboard, quality routes, qualityManagementService).
