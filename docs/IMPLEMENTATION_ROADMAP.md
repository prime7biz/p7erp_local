# P7 ERP – Implementation roadmap

Single reference for what’s done, what’s next, and in what order. Aligns with `docs/PROJECT_PLAN.md` and `docs/REFERENCE_PARITY.md`; reference codebase: `replit-legacy/primeX-ERP/`.

---

## Current state

- **Auth:** Company code (or tenant ID) + username/email + password; JWT; tenant resolved by `company_code`. Register creates tenant + first user.
- **Public:** Landing, Features, Pricing, About, Contact, garments-erp, buying-house-erp, Privacy, Terms, How it works, Security.
- **App sidebar & routes:** Full structure under `/app`; Dashboard, Merchandising, Export & Import (commercial), Inventory, Manufacturing, Quality, AI, HR, Finance, Workflow, Reports, Settings.
- **Done (backend + frontend):** Merchandising core (customers, inquiries, quotations, orders, styles, BOM, pipeline, alerts, consumption reconciliation); Inventory (items, units, warehouses, PO, GRN, delivery challans, gate passes, process/mfg orders, consumption control, reconciliation, stock summary/ledger); Manufacturing (samples requests, TNA, production planning, shop floor, quality dashboard/inspections/CAPA, IE); Finance/Accounts (chart of accounts, vouchers, banking, reports, periods, profitability, etc.); HR (departments, designations, employees, attendance, leave, payroll, performance, recruitment, ESS, reports); Settings (users, roles, audit, currency, config, backup); Reports (merchandising overview only).
- **Done (since roadmap):** Commercial (export cases, proforma invoices, BTB LCs) – backend + frontend; Reports – Purchase Orders, GRN Summary, Sales Orders (backend + frontend); Settings – tenant page, activity-logs (reuses Audit), pricing page, cheque-templates page (backend stubs + frontend).
- **Done (A4):** Quality – Lab Tests page (quality checks with check_type=lab), Returns page (material returns list); backend: check_type filter on quality checks, GET list material returns.
- **Done (A5):** AI tools – dedicated pages for Assistant, Automation, and Predictions (coming-soon state; no backend yet).
- **Done (A6):** Workflow/approvals – All Approvals page has quick links (Voucher, Leave, Payroll, Purchase & AP); dashboard KPI “Pending Approvals” uses real count (vouchers, payment runs, recons, leave, payroll) and links to /app/approvals.
- **Done (A7):** Logistics – dedicated coming-soon page (import/export tracking, shipment, document management).
- **Done (A8):** Parties & Document Flow – dedicated coming-soon pages.
- **Done:** Tutorials – dedicated coming-soon list and article pages.
- **Done:** Remaining report sub-pages – dedicated coming-soon pages (LC Outstanding, BTB Maturity, Production Efficiency, QC Summary, Employee, Payroll, Shipments, Gate Passes, Challans, Reconciliation, Exceptions).
- **Done:** All app routes use dedicated pages; inventory sub-pages, samples, time-action, commercial index, reports index, and cashflow calendar now use `AppComingSoonPage` (coming-soon style).
- **Placeholders only:** Catch-all route (`*`) still uses `PlaceholderPage` for unknown paths.

---

## Task breakdown by owner

### Build

| Id   | Description | Key files/dirs | Dependency |
|------|-------------|----------------|------------|
| **B1** | Backend build: install deps, lint, run tests. | `backend/`, `requirements.txt`, `pyproject.toml` or `pytest.ini` | — |
| **B2** | Env and config: `.env` from `.env.example`, DB URL, CORS, API prefix. | `.env`, `.env.example`, `backend/app/config.py` | — |
| **B3** | Frontend build: install deps, lint, production build. | `frontend/`, `package.json`, `vite.config.ts` | — |

### Commercial (A1)

| Id   | Description | Key files/dirs | Dependency |
|------|-------------|----------------|------------|
| **A1 Backend** | Commercial API: export cases, proforma invoices, BTB LCs. CRUD and key flows per reference. | `backend/app/modules/commercial/`, `backend/app/models/` (commercial if new), reference `server/routes/commercial/`, `shared/schema/commercial.ts` | After B3 |
| **A1 Frontend** | Commercial UI: export cases, PI, BTB LCs list/detail pages wired to new API. | `frontend/src/pages/app/` commercial pages, replace placeholders at `commercial/export-cases`, `proforma-invoices`, `btb-lcs` | After A1 Backend |

### Follow-on areas (A2–A8)

| Id   | Description | Key files/dirs | Dependency |
|------|-------------|----------------|------------|
| **A2** | Reports: implement key report pages (e.g. PO, GRN, sales orders, LC outstanding, BTB maturity, production, QC, payroll, shipments, gate passes, challans) with backend where needed. | `frontend/src/pages/app/`, `backend/app/modules/reports/` | After A1 Frontend |
| **A3** | Settings: tenant settings, activity logs (Audit), pricing, cheque templates – done (backend stubs + real pages). | `frontend/src/pages/settings/`, `backend/app/modules/settings/` | After B3 |
| **A4** | Quality: lab-tests and returns pages – done (Lab Tests uses quality checks with type=lab; Returns lists material returns; backend check_type filter + GET material-returns). | `frontend/src/pages/app/manufacturing/`, `backend/app/modules/manufacturing/` | After B3 |
| **A5** | AI tools: assistant, automation, predictions – done (dedicated coming-soon pages under `frontend/src/pages/app/ai/`). | `frontend/src/pages/app/ai/` | After B3 |
| **A6** | Workflow: approvals – done (quick links on All Approvals; dashboard pending count from vouchers, payment runs, recons, leave, payroll; Pending Approvals card links to /app/approvals). | `frontend/src/pages/app/AllApprovalsPage.tsx`, `backend/app/modules/dashboard/router.py` | After B3 |
| **A7** | Logistics: done (dedicated coming-soon page at `frontend/src/pages/app/logistics/LogisticsPage.tsx`). | `frontend/src/pages/app/logistics/` | After A1 Backend |
| **A8** | Parties & Document Flow: done (dedicated coming-soon pages). | `frontend/src/pages/app/parties/`, `frontend/src/pages/app/flow/` | After A1 Frontend |

---

## Order of execution

1. **B1** – Backend build (deps, lint, tests).
2. **B2** – Env and config (`.env`, DB, CORS).
3. **B3** – Frontend build (deps, lint, prod build).
4. **A1 Backend** – Commercial module API (export cases, PI, BTB LCs).
5. **A1 Frontend** – Commercial UI wired to API.
6. **A2** – Reports (key report pages + backend as needed).
7. **A3** – Settings (tenant, activity logs, etc.).
8. **A4** – Quality (lab-tests, returns).
9. **A5** – AI tools (assistant, automation, predictions).
10. **A6** – Workflow/approvals.
11. **A7** – Logistics.
12. **A8** – Parties & Document Flow.

---

## What's next (optional)

- **Build verification:** Run B1–B3 locally (see below) to confirm backend and frontend build.
- **Coming-soon to full features:** Replace coming-soon pages with real backend + UI for AI (assistant, automation, predictions), Logistics, Parties, Document Flow, and the 11 report sub-pages (LC Outstanding, BTB Maturity, etc.).
- **Reference extras:** Register approval status (PENDING/APPROVED/REJECTED); public `/modules/*` and `/resources` pages; workflow-tasks/notifications if matching PrimeX topnav.

---

## Build verification (B1–B3)

See **`docs/BUILD_VERIFICATION.md`** for the full checklist. Summary: **B1** – `cd backend` then `python -m pip install -r requirements.txt`; **B2** – copy `.env.example` to `.env` (root and frontend), set `DATABASE_URL`, `JWT_SECRET`, `VITE_API_BASE_URL`, run `alembic upgrade head`; **B3** – `cd frontend` then `npm install` and `npm run build`.

---

## Notes

- Run backend and frontend from repo root per `README.md`; ensure DB migrations applied before running app.
- For each task, prefer matching reference behavior and routes in `replit-legacy/primeX-ERP/` (see REFERENCE_PARITY.md).
