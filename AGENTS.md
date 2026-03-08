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

## Where to look

- **Plans and parity:** `docs/REFERENCE_PARITY.md`, `docs/PROJECT_PLAN.md`, `docs/session_plan_legacy.md`.
- **Cursor rules:** `.cursor/rules/project.mdc` (project context, always apply).
- **Run / structure:** `README.md`, `.env.example`, `docker-compose.yml`.

## Auth and tenant

- Login: Company Code (or Tenant ID) + Username or Email + Password. Tenant resolved by `company_code`.
- All tenant-scoped data has `tenant_id`; APIs filter by tenant. Tenant types: `manufacturer` | `buying_house` | `both`.
