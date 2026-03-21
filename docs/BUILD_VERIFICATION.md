# P7 ERP – Build verification

Checklist for B1–B3. Run from repo root: `p7erp_local`.

**PowerShell:** Use `;` to chain commands (e.g. `cd frontend; npm run build`). Do not use `&&`.

## Docker (`docker compose`)

Use this when you run the stack with **`docker compose`** (see repo root `docker-compose.yml`). The backend image is **Python 3.12** with dependencies from `requirements.txt` — do **not** rely on Windows “python” on the host for migrations.

1. **Start services** (from repo root):

   ```powershell
   docker compose up -d
   ```

2. **Run DB migrations** inside the backend container (after `postgres` is healthy):

   ```powershell
   docker compose exec backend alembic upgrade head
   ```

   If the service name differs, use: `docker compose ps` and replace `backend` with your API service name.

3. **API URL:** Backend is exposed at **`http://localhost:8000`** by default. The frontend container typically maps **`http://localhost:5173`** → nginx port 80 (see `docker-compose.yml`).

4. **When to re-run migrations:** After pulling code that adds Alembic revisions (e.g. new files under `backend/alembic/versions/`). The compose file notes that migrations are **manual** in dev.

**Why Docker fixes the earlier migration errors:** Host Python 3.14 may fail to build some wheels; the Dockerfile uses **3.12-slim**, which matches a supported stack for FastAPI / pydantic.

## B1 – Backend build

```powershell
cd backend
python -m pip install -r requirements.txt
```

(Use `py -m pip` if `python` is not in PATH on Windows.)

**Success:** No pip errors. Then run `uvicorn app.main:app --reload` to confirm the app starts.

## B2 – Env and config

1. Copy `.env.example` to `.env` in the repo root. Set `DATABASE_URL` and `JWT_SECRET`. Optionally set `CORS_ORIGINS=http://localhost:5173` for local frontend.
2. Ensure PostgreSQL is running; create the DB if needed. From `backend/`: `alembic upgrade head`.
3. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_API_BASE_URL=http://localhost:8000`.

**Success:** Backend starts without config errors; frontend can call the API when both are running.

## B3 – Frontend build

```powershell
cd frontend
npm install
npm run build
```

Optional quality check (ESLint):

```powershell
cd frontend
npm run lint
```

**Success:** No TypeScript or Vite errors; `frontend/dist/` is produced. (`npm run lint` may still report existing warnings/errors until the codebase is cleaned up.)

## Quick reference

| Step | Command |
|------|---------|
| Backend deps | `cd backend` then `python -m pip install -r requirements.txt` |
| Migrations (local Python) | `cd backend` then `python -m pip install -r requirements.txt` then `python -m alembic upgrade head` |
| Migrations (Docker) | From repo root: `docker compose exec backend alembic upgrade head` |
| Backend run | `cd backend` then `uvicorn app.main:app --reload` |
| Frontend build | `cd frontend` then `npm install` then `npm run build` |
| Frontend dev | `cd frontend` then `npm run dev` |
| Frontend lint | `cd frontend` then `npm run lint` |

## Sign-off

- [ ] B1 – Backend dependencies install; uvicorn starts the app.
- [ ] B2 – `.env` in place; migrations run; backend starts.
- [ ] B3 – `npm run build` succeeds.
