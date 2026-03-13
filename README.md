# P7 ERP

Multi-tenant SaaS ERP for garments (manufacturing and buying house).  
**Reference:** PrimeX (replit-legacy) â€“ same workflows; **stack:** Python (FastAPI) + React (TypeScript).


## Build status

- **Frontend build:** `cd frontend` then `npm ci` (or `npm install` if no lockfile), then `npm run build`.
- **Backend run:** From repo root: copy `.env.example` to `backend/.env` and configure; then `cd backend`, `pip install -r requirements.txt`, `alembic upgrade head`, and `uvicorn app.main:app --port 8000`.
- **Env:** Copy root `.env.example` to `.env` (or `backend/.env` if your app reads it there). For frontend, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL` (e.g. `http://localhost:8000`). See **`docs/BUILD_VERIFICATION.md`** for the full B1–B3 checklist.

## Tenant type

Each tenant is one of: **manufacturer** | **buying house** | **both**. This controls module visibility and API access.

## Structure

```
f:\P7ERP\
â”œâ”€â”€ backend/          # FastAPI (Python)
â”œâ”€â”€ frontend/         # React + Vite (TypeScript)
â”œâ”€â”€ replit-legacy/    # PrimeX reference (read-only)
â”œâ”€â”€ docker-compose.yml
â””â”€â”€ .env.example
```

## Run locally (dev)

**PowerShell:** Use `;` instead of `&&` to chain commands (e.g. `cd backend; alembic upgrade head`).

1. Start DB and Redis: `docker compose up -d postgres redis` (wait until healthy).
2. Backend: copy `.env.example` to `.env` (or `backend/.env`); then:
   - `cd backend` then `pip install -r requirements.txt`
   - `alembic upgrade head`
   - `uvicorn app.main:app --reload --port 8000`
3. Frontend: `cd frontend && npm install && npm run dev`
4. Open http://localhost:5173. Create a tenant (e.g. via API or `/api/docs`): `POST /api/v1/tenants` with `{"name":"Acme","domain":"acme.local","tenant_type":"both"}`. Then register a user with that tenant ID and log in.

## Run with Docker

Use Docker as a **dev-first** workflow:

1. First-time setup (or after dependency/Dockerfile changes): `docker compose up --build`
2. Normal day-to-day development: `docker compose up`
3. Open:
   - Frontend: http://localhost:5173
   - Backend docs: http://localhost:8000/docs

### Dev behavior in Docker

- Backend runs with `uvicorn ... --reload` and watches bind-mounted `./backend`.
- Frontend runs Vite dev server on `0.0.0.0:5173` with HMR and Docker/Windows-safe file watching.
- Normal Python/TS/TSX/CSS code edits do **not** require image rebuild.

### Migrations in development

- Run migrations only when database schema changes (new/edited Alembic migration files, model/schema changes needing DB updates).
- Ordinary API/UI code edits do **not** need migrations.
- Manual migration command:
  - `docker compose exec backend alembic upgrade head`
