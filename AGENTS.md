# P7 ERP – Project memory for AI agents

Use this file and `.cursor/rules/` when working on this repo (e.g. on another machine or new chat).

## Project

- **Name:** P7 ERP  
- **Repo:** https://github.com/prime7biz/p7erp_local  
- **Stack:** Python (FastAPI) backend, React (TypeScript) frontend.  
- **Reference:** PrimeX in `replit-legacy/primeX-ERP/` – match structure and behavior where applicable.

## User / conventions

- User is a **beginner at programming**; prefer clear directory structure and simple, well-explained code.
- Keep **directory structure clear**: `backend/`, `frontend/`, `docs/`, `replit-legacy/`.
- **Table row actions:** Use a single combined "Actions" dropdown per row (see `.cursor/rules/action-buttons.mdc`). Do not use separate Edit/Delete icon buttons.

## Where to look

- **Plans and parity:** `docs/REFERENCE_PARITY.md`, `docs/PROJECT_PLAN.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/session_plan_legacy.md`.
- **Inventory roadmap:** `docs/INVENTORY_MODULE_ADVANCEMENT_PLAN.md` – navigation fixes, backend robustness, transfers/adjustments, UX polish.
- **Inventory mobile lists:** `frontend/src/hooks/useInventoryListView.ts`, `frontend/src/components/inventory/InventoryMobileList.tsx` — narrow-only Table vs Cards, horizontal scroll for wide tables.
- **API load logging (audit):** `frontend/src/utils/logApiError.ts` — use instead of empty `.catch` handlers; see `docs/PRE_PRODUCTION_AUDIT.md` Finding #5.
- **List pagination / caps (audit):** `backend/app/common/pagination.py` (`MAX_PAGE_SIZE` = 500). Heavy lists use paginated endpoints or `limit`/`offset`; optional `BOOTSTRAP_REGISTRATION_KEY` gates first-user register (Finding #4).
- **Build:** `docs/BUILD_VERIFICATION.md` – B1–B3 checklist (backend deps, env, frontend build). Frontend: `npm run lint` (ESLint) and `npm run lint:fix` in `frontend/`.
- **Cursor rules:** `.cursor/rules/project.mdc` (project context, always apply).
- **Run / structure:** `README.md`, `.env.example`, `docker-compose.yml`.
- **Marketing SEO:** `docs/SITEMAP_NOTE.md`, `docs/SEO_SEARCH_CONSOLE.md`; sitemap generator `frontend/scripts/generate-sitemap.mjs`, meta in `frontend/src/components/Seo.tsx`.
- **Finance UAT and go-live:**
  - `docs/FINANCE_UAT_CHECKLIST.md` – high-level test checklist
  - `docs/FINANCE_UAT_TEST_CASES.md` – numbered test cases (FIN-UAT-001+)
  - `docs/FINANCE_GO_LIVE_CRITERIA.md` – go/no-go gates and sign-off
  - `docs/FINANCE_CUTOVER_PLAN.md` – cutover runbook and rollback
  - `docs/FINANCE_OPERATIONS_SOP.md` – daily/weekly/month-end procedures
  - `docs/FINANCE_UAT_CLOSURE_REPORT.md` – engineering readiness closure
  - `docs/FINANCE_CHAT_HANDOFF_2026-03-11.md` – new-chat continuation handoff

## Auth and tenant

- Login: Company Code (or Tenant ID) + Username or Email + Password. Tenant resolved by `company_code`.
- All tenant-scoped data has `tenant_id`; APIs filter by tenant. Tenant types: `manufacturer` | `buying_house` | `both`.
