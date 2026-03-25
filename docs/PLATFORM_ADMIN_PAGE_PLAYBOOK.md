# Platform Admin — Operations Rebuild Playbook

This document is **not** a UI-only checklist. It governs how we add or change **platform operations** in `frontend-admin/`: every page must be backed by real APIs, consistent RBAC, and production-grade states.

## Global execution rules

1. **Inspect backend first** — Open `backend/app/modules/admin/` routers (and `auth.py` dependencies) before writing UI.
2. **Reuse existing APIs** — Prefer endpoints that already exist; extend query params or response fields only when needed.
3. **Add backend endpoints only when necessary** — If the UI needs data or actions that truly do not exist, add a small, focused route with the same auth patterns (`Depends(any_admin)`, `super_only`, etc.).
4. **No mock data** — No hardcoded placeholder rows, fake KPIs, or `setTimeout` demos. Empty states are allowed when the API returns zero rows.
5. **Preserve theme** — `frontend-admin` uses Tailwind slate/indigo patterns, `PageHeader`, `DataTable`, `StatusBadge`, combined **Actions** menus, etc. Do not introduce a second visual system.
6. **Information density** — Prefer filters, compact tables, secondary text, and tabs over noisy cards; avoid clutter.
7. **Enterprise consistency** — `PageHeader` + `KPI`/`DataTable`/`Tabs`/`LoadingState`/`EmptyState`/`Error` patterns; same spacing and typography across pages.
8. **Permissions** — `GET /api/v1/admin/auth/me` returns `capabilities` (see `backend/app/modules/admin/permissions.py`). Use `RequireCapability` on routes and `can(...)` for actions. Backend `Depends(...)` remains authoritative.

**Integration surface:** `frontend-admin/src/api/client.ts` (single HTTP client; no ad-hoc `fetch` in pages except downloads where already centralized).

---

## Per-page implementation template

When implementing or refactoring **any** admin page, fill this in (copy into a PR description or ticket).

### 1. Page objective

- One sentence: what operational outcome does this page enable (e.g. “suspend tenant”, “review invoice queue”, “audit cross-tenant API errors”)?

### 2. Reused backend APIs

List **exact** routes (prefix `/api/v1/admin` unless noted) and HTTP methods:

| Method | Path | Router / role |
|--------|------|-----------------|
| … | … | … |

### 3. Missing backend APIs (if any)

- If none: write **“None — fully covered by existing routes.”**
- If needed: describe the minimal endpoint, why it is required, and how it aligns with existing `Depends` patterns.

### 4. UI sections / components

- **Layout:** e.g. `PageHeader`, `FilterBar`, `Tabs`, `DataTable`, `SideDrawer`, `Modal`, `ConfirmDialog`.
- **Density:** where filters live; how pagination works; what stays above the fold on small screens.

### 5. Loading / empty / error states

- **Loading:** `LoadingState` or skeleton that matches the page (avoid full-page spinner on silent polling).
- **Empty:** `EmptyState` or table `emptyMessage` with a clear next step.
- **Error:** user-visible message or toast; `logApiError` / toast pattern for failures (no silent `.catch`).
- **Success:** toast or inline confirmation after mutations.

### 6. Permissions and actions

- **Route capability:** `RequireCapability` key from `frontend-admin/src/auth/permissions.ts`.
- **Row actions:** single **Actions** dropdown per row where applicable.
- **Destructive actions:** confirm dialog; align with backend role (e.g. `super_only`).

### 7. Responsive behavior

- Sidebar + main content: `overflow`, `min-w-0`, stacked filters on narrow viewports.
- Tables: horizontal scroll or card fallback where the project already does so (admin tables often use `DataTable` + overflow).

---

## Current inventory: Pages ↔ APIs

Below is a **snapshot** of the main app routes and how they connect to the backend. Update this when adding endpoints or pages.

| Route | Page | Primary APIs (relative to `/api/v1/admin`) |
|-------|------|---------------------------------------------|
| `/login` | Login | `POST /auth/login` → `GET /auth/me` (via context) |
| `/` | Dashboard | `GET /dashboard/summary`, `GET /monitoring/system/health`, `GET /security/audit` (activity, if permitted) |
| `/tenants` | Tenant list | `GET /tenants` |
| `/tenants/new` | Tenant create | `POST /tenants` |
| `/tenants/:id` | Tenant 360 | `GET /tenants/{id}`, `GET /tenants/{id}/health`, `GET /tenants/{id}/stats`, `GET /tenants/{id}/entitlements`, `GET/POST/PATCH/DELETE` support notes, `GET /tenants/{id}/users`, user actions, `GET /billing/*`, `GET /monitoring/*`, `GET /ai/*`, `GET /support/tickets`, backups, etc. (see `TenantDetailPage.tsx`) |
| `/billing/plans` | Plans | `GET /billing/plans` |
| `/billing/plans/new`, `.../edit` | Plan form | `GET /billing/plans` (load one), `POST /billing/plans`, `PATCH /billing/plans/{id}` |
| `/billing/subscriptions` | Subscriptions | `GET /billing/subscriptions`, `PUT /billing/tenants/{id}/subscription`, `POST .../cancel` |
| `/billing/invoices` | Invoices | `GET/POST/PATCH /billing/invoices`, send/mark-paid/void as implemented |
| `/billing/payments` | Payments | `GET /billing/payments` |
| `/billing/revenue` | Revenue | `GET /billing/revenue`, `GET /billing/revenue/export` |
| `/operations/backups` | Backup center | `GET/POST` backup jobs & schedules, download as implemented |
| `/operations/jobs` | Background jobs | `GET /dashboard/maintenance-tasks` (task catalog; runner is cron) |
| `/operations/restore` | Restore center | **No execution API yet** — IA / wizard only |
| `/operations/ai` | AI operations | `GET /ai/*`, budgets, costs, kill switch, settings as per `ai_router` |
| `/support/announcements` | Announcements | `GET` list; create/edit use dedicated routes below |
| `/support/announcements/new`, `.../:id/edit` | Announcement form | `POST/PATCH /support/announcements` |
| `/support/tickets` | Support tickets | `GET/POST/PATCH /support/tickets`, messages |
| `/monitoring/audit` | Tenant audit log | `GET /monitoring/audit`, `GET /monitoring/audit/export` |
| `/monitoring/admin-audit` | Platform admin audit | `GET /security/audit` |
| `/monitoring/health` | System health | `GET /monitoring/system/health`, `GET .../db-stats`, `GET .../slow-queries` |
| `/monitoring/usage` | Usage trends | `GET /monitoring/usage` |
| `/security/admins` | Platform admins | `GET/POST/PATCH/DELETE` under `security_router` |
| `/security/sessions` | Sessions | `GET /security/sessions`, `POST .../revoke` |
| `/security/rate-limits` | Rate limits | `GET /security/rate-limits`, `PUT ...` |
| `/security/impersonation` | Impersonation log | `GET /security/impersonation-sessions` |
| `/config/settings` | Platform settings | `GET/PUT /settings` |
| `/config/feature-flags` | Feature flags hub | `GET /tenants` (search + link to tenant detail flags tab) |

### Known gaps (intentional or future)

- **Restore center:** No restore execution API yet; playbook requires documenting the future `POST` contract when implemented.
- **Invoices list (global):** Tenant detail filters client-side; optional future `?tenant_id=` on list invoices if volume grows.

---

## References

- Backend RBAC: `backend/app/modules/admin/auth.py`
- Capability map: `backend/app/modules/admin/permissions.py` ↔ `frontend-admin/src/auth/permissions.ts`
- Row actions pattern: `.cursor/rules/action-buttons.mdc`
