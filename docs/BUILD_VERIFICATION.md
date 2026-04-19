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

### Faster Docker rebuilds (use the cache)

- **Normal rebuild (fast):** From repo root, use BuildKit cache — **do not** pass `--no-cache` unless you truly need a clean install (suspicious cache bug, or you changed base images and want to verify from scratch).

  ```powershell
  docker compose build
  docker compose up -d
  ```

  Docker reuses layers when `requirements.txt`, `package.json` / lockfiles, and earlier steps are unchanged. Only changed layers (and later steps) rebuild.

- **After editing only app code** (Python/TS, not dependency files): The dependency-install steps stay cached; rebuild is mostly `COPY` + `npm run build` / image export.

- **When dependencies change:** After editing `requirements.txt` or `package-lock.json`, the matching `RUN pip install` / `RUN npm ci` layer reruns. BuildKit **cache mounts** (pip/npm) in the Dockerfiles still speed repeated installs on the same machine.

- **Full clean rebuild** (slow; use rarely): `docker compose build --no-cache`

- **Optional helper:** `scripts/docker-rebuild.ps1` runs a normal cached build and restarts the stack.

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

## Optional: OpenRouter + Ollama (tier-1 AI)

Default tier-1 uses **Ollama** when **`OLLAMA_URL`** is set, else **OpenRouter** when **`OPENROUTER_API_KEY`** + **`OPENROUTER_MODEL`** are set (`OPENROUTER_TIER1_PREFERRED=true` flips to cloud-first when both exist). See **`docs/OPENROUTER.md`** and **`docs/OLLAMA_GEMMA.md`**. Set **`GEMINI_ENABLED=true`** and **`GEMINI_API_KEY`** only if you need legacy Gemini-backed planning/extraction.

## Optional: AI form extraction smoke test

After B1–B3, with backend + frontend running and a logged-in session, you can verify the stateless **document → form** endpoints (see `docs/AI_FORM_EXTRACTION.md`):

- `POST /api/v1/ai-extract/customer-form` and `POST /api/v1/ai-extract/inquiry-form` with `multipart/form-data` (`file` = PNG/JPEG/WebP/PDF, max 10 MB).

Or use the **Import Customer Info** / **Import Inquiry Info** blocks on **New customer** and **New inquiry** pages.

## Optional: Financier portal (advanced) demo data

After migrations, for a tenant that already has **items**, **vendors**, and **BTB LCs** (for example from `scripts/seed_lakhsma_interconnected_demo.py` and `scripts/seed_trade_import_export_workflow_demo.py --tenant-code <COMPANY_CODE>`), you can seed facilities, procurement rows, and a demo financier login:

```powershell
docker compose exec backend python scripts/seed_financier_portal_demo.py --company-code LAKH806201
```

Default demo login email is `financier.portal.demo@p7erp.local` (password printed on first create). Re-run is idempotent.

Verification:

```powershell
docker compose exec backend pytest tests/test_financier_portal_demo_seed.py -q
```

### Comprehensive Lakhsma financier demo (all portal pages)

For **`LAKH806201`** after the interconnected Lakhsma seed, run the **full** financier demo (extra vendors, POs/GRNs, stock movements, second BTB LC, trade cases/docs, facilities/utilizations/repayments, bank accounts, vouchers, bills, production rows, shipments, monthly snapshots). Idempotent marker vendor: `LKH-VEND-FABRIC-01`.

```powershell
docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py
docker compose exec backend python scripts/seed_financier_full_demo.py --company-code LAKH806201
```

This also runs the base `financier_portal_demo` logic (principal + first facility). Verification:

```powershell
docker compose exec backend pytest tests/test_financier_full_demo_seed.py tests/test_financier_portal_demo_seed.py -q
```

### UI shows empty lists but seeds ran (Docker)

The API and DB can be fine while the browser still shows nothing. Check in order:

1. **Correct app and login role** — Main ERP lists live under **`http://localhost:5173`** (not `5174/admin`). On the **unified login**, choose **Staff** or **Tenant admin**, enter **company code `LAKH806201`**, then your user email/password. **Customer** / **Financier** roles use the **portal** (`/portal/...`), not the full `/app` merchandising lists.
2. **Clear stale session** — In the browser, open DevTools → **Application** → **Local storage** for your site. Remove **`p7_token`** and **`p7_tenant_id`**, then log in again. A wrong or missing tenant id breaks `X-Tenant-Id` on API calls.
3. **Verify the network call** — DevTools → **Network** → reload **Orders**. You should see **`GET .../api/v1/orders/paginated`** with status **200** and JSON **`total`** greater than 0. **401** means log in again. If the request goes to the **wrong host** (not the machine running Docker), set a repo-root **`.env`** for Compose with `VITE_API_BASE_URL=` (empty) and **`docker compose build frontend && docker compose up -d`** so the SPA uses **same-origin** `/api/...` (nginx proxies to `backend:8000`).
4. **Financier portal data** — Log in as **Financier** with the same company code, email **`financier.portal.demo@p7erp.local`** (password from first seed create), after **`seed_financier_full_demo.py`** has been run.

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
