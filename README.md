# P7 ERP

Multi-tenant SaaS ERP for garments (manufacturing and buying house).  
**Reference:** PrimeX (replit-legacy) – same workflows; **stack:** Python (FastAPI) + React (TypeScript).

## Tenant type

Each tenant is one of: **manufacturer** | **buying house** | **both**. This controls module visibility and API access.

## Structure

```
f:\P7ERP\
├── backend/          # FastAPI (Python)
├── frontend/         # React + Vite (TypeScript)
├── replit-legacy/    # PrimeX reference (read-only)
├── docker-compose.yml
└── .env.example
```

## Run locally (dev)

**PowerShell:** Use `;` instead of `&&` to chain commands (e.g. `cd backend; alembic upgrade head`).

1. Start DB and Redis: `docker compose up -d postgres redis` (wait until healthy).
2. Backend: copy `.env.example` to `backend/.env`; then:
   - `cd backend` then `pip install -r requirements.txt`
   - `alembic upgrade head`
   - `uvicorn app.main:app --reload --port 8000`
3. Frontend: `cd frontend && npm install && npm run dev`
4. Open http://localhost:5173. Create a tenant (e.g. via API or `/api/docs`): `POST /api/v1/tenants` with `{"name":"Acme","domain":"acme.local","tenant_type":"both"}`. Then register a user with that tenant ID and log in.

## Run with Docker

`docker compose up --build` then open http://localhost:5173 (frontend) and http://localhost:8000/docs (API).
