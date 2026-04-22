# P7 ERP

Multi-tenant SaaS ERP for garments (manufacturing and buying house).  
**Reference:** PrimeX (replit-legacy) – same workflows. **Stack:** Python (FastAPI) + React (TypeScript).

---

## Technical stack (current)

| Layer | Technology | Version / notes |
|-------|------------|-----------------|
| **Backend runtime** | Python | 3.12 (`python:3.12-slim` in Docker) |
| | API framework | FastAPI `0.115.6` |
| | ASGI server | Uvicorn `0.32.1` |
| | Validation/settings | Pydantic `2.10.3`, pydantic-settings `2.6.1` |
| | ORM / DB access | SQLAlchemy async `2.0.36` + asyncpg `0.30.0` |
| | Migrations | Alembic `1.14.0` |
| | Auth/security | JWT (`python-jose`), passlib + bcrypt |
| | API/form helpers | python-multipart, email-validator |
| | Reporting import/export | openpyxl |
| **Frontend runtime/build** | Node.js | 20 LTS (`node:20-alpine` for build/dev) |
| | Framework | React `18.3.1` + React DOM |
| | Language | TypeScript `5.6.x` |
| | Routing | React Router DOM `7.0.2` |
| | Build tool | Vite `6.0.1` + `@vitejs/plugin-react` |
| | Styling | Tailwind CSS `3.4.x`, PostCSS, Autoprefixer |
| | UI/UX libraries | Radix UI, Framer Motion, Lucide React |
| | Utility libraries | clsx, class-variance-authority, tailwind-merge, react-helmet-async, qrcode.react |
| **Database** | PostgreSQL | 16 (`postgres:16-alpine`) |
| **Cache (optional)** | Redis | 7 (`redis:7-alpine`) |
| **Containers/orchestration** | Docker + Docker Compose | Dev and production compose files |
| **Frontend serving (prod)** | Nginx | `nginx:1.27-alpine` serving built `frontend/dist` |

### Stack notes

- **Frontend production image:** multi-stage build (`node:20-alpine` -> `nginx:1.27-alpine`), static files served by Nginx.
- **Backend production command:** Uvicorn serving `app.main:app` on port `8000`.
- **Tenant/auth model:** Multi-tenant app (`manufacturer` | `buying_house` | `both`) with JWT-based authentication.
- **Reference parity:** Workflows are aligned with PrimeX (`replit-legacy/primeX-ERP/`) where applicable.

### Version update checklist

Use this quick list whenever dependencies or runtime versions change:

1. Update backend versions in `backend/requirements.txt`.
2. Update frontend versions in `frontend/package.json`.
3. Update runtime image tags in `backend/Dockerfile`, `frontend/Dockerfile`, and `frontend/Dockerfile.prod`.
4. Update service image tags in `docker-compose.yml` and `docker-compose.prod.yml` (Postgres/Redis/Nginx if changed).
5. Reflect the same version changes in this README table (`Technical stack (current)`).
6. Run a quick verification:
   - Backend: `cd backend` -> `pip install -r requirements.txt`
   - Frontend: `cd frontend` -> `npm ci`
   - Docker: `docker compose config` (checks compose syntax and final values)

---

## System requirements (live server)

- **OS:** Linux recommended (e.g. Ubuntu 22.04 LTS); Windows/macOS for dev only.
- **Python:** 3.12 (backend).
- **Node.js:** 20 LTS (for building frontend; not required at runtime if you serve static files).
- **PostgreSQL:** 16 (or 14+).
- **Memory:** Minimum 2 GB RAM; 4 GB+ recommended for DB + app.
- **Ports:** 8000 (backend API), 5432 (PostgreSQL), 6379 (Redis, optional). For production you typically put Nginx (or similar) in front and expose 80/443 only.

---

## Environment variables

### Backend (repo root `.env` or `backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://p7erp:p7erp@localhost:5432/p7erp` | PostgreSQL URL. Use `postgresql://user:pass@host:port/dbname`; the app converts it to `postgresql+asyncpg://` internally. |
| `JWT_SECRET` | Yes | (none) | **Must change in production.** Long random string (e.g. 32+ chars). |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `JWT_EXPIRE_MINUTES` | No | `60` | Token expiry in minutes. |
| `TENANT_STRATEGY` | No | `header` | `header` \| `subdomain` \| `path`. |
| `CORS_ORIGINS` | No | (dev defaults) | Comma-separated allowed origins, e.g. `https://yourdomain.com`. Empty = same-origin only. |
| `REDIS_URL` | No | (none) | Optional, e.g. `redis://localhost:6379/0`. |
| `API_V1_PREFIX` | No | `/api/v1` | API path prefix. |
| `AI_CONFIRMATION_TOKEN_PEPPER` | No | (dev default) | Change in production if using AI tool. |
| `AI_RATE_LIMIT_*` / `AI_TIMEOUT_*` / `AI_CIRCUIT_BREAKER_*` | No | (see `backend/app/config.py`) | Optional tuning for AI module. |
| `OPENROUTER_API_KEY` | No | (empty) | OpenRouter API key. With `OPENROUTER_MODEL`, tier-1 uses **Ollama first** when `OLLAMA_URL` is set; set `OPENROUTER_TIER1_PREFERRED=true` for cloud first. See `docs/OPENROUTER.md`. |
| `OPENROUTER_MODEL` | No | `google/gemma-4-31b-it:free` | Model slug on OpenRouter. For fewer 429s, use a slug **without** `:free` and credits (e.g. `google/gemini-2.5-flash-lite`); see `docs/OPENROUTER.md`. |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | OpenAI-compatible API base. |
| `OPENROUTER_ENABLED` | No | `true` | Set `false` to skip OpenRouter even if a key is present. |
| `GEMINI_API_KEY` | No | (empty) | Google Gemini API key (legacy). Off by default; enable with `GEMINI_ENABLED=true` for planning/extraction features that still use Gemini. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Model name passed to the Gemini API. |
| `GEMINI_ENABLED` | No | **`false` by default** | Set `true` with `GEMINI_API_KEY` only if you need Gemini-backed features. |
| `AI_MONTHLY_BUDGET_LIMIT` | No | (none) | Optional cap on Gemini **text** calls per calendar month (see `backend/app/common/gemini_budget.py`). |
| `OLLAMA_ENABLED` | No | `true` | Local Ollama for tier-1 when `OLLAMA_URL` is set (default before OpenRouter unless `OPENROUTER_TIER1_PREFERRED=true`). OpenRouter tier-1 still falls back to Ollama on empty/failed responses when Ollama is up. |
| `OLLAMA_URL` | No | `http://ollama:11434` | Ollama HTTP API base (use `http://host.docker.internal:11434` if Ollama runs on the host and the API is in Docker). |
| `OLLAMA_MODEL` | No | `gemma2:2b-instruct-q4_K_M` | Model tag in Ollama (`ollama list`). |
| `PAID_LLM_BASE_URL` | No | (empty) | Optional OpenAI-compatible base for `PAID_LLM_PROVIDER=openai` (e.g. OpenRouter URL). |

**Docker Compose:** When you run `docker compose up`, variables are injected from a **repo root** `.env` (same folder as `docker-compose.yml`). `backend/.env` is used when you run Uvicorn **locally** without Docker. See **`docs/OPENROUTER.md`** and **`docs/OLLAMA_GEMMA.md`**.

### Frontend (build-time; `frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | Yes (production) | `http://localhost:8000` | Backend API base URL (no trailing slash), e.g. `https://api.yourdomain.com` or `https://yourdomain.com` if same host. |

Copy from `frontend/.env.example` and set `VITE_API_BASE_URL` before `npm run build`.

---

## Project structure

```
p7erp_local/
├── backend/                 # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── main.py          # App entry, CORS, routers
│   │   ├── config.py        # Settings (env)
│   │   ├── database.py      # Async SQLAlchemy + asyncpg
│   │   ├── models/
│   │   └── modules/         # Auth, tenants, orders, finance, etc.
│   ├── alembic/             # Migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # React + Vite (TypeScript)
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docs/                    # Plans, parity, checklists
├── docker-compose.yml       # Dev: postgres, redis, backend, frontend
├── .env.example             # Backend env template
└── README.md
```

---

## Build and run (development)

**PowerShell:** Use `;` instead of `&&` to chain commands (e.g. `cd backend; alembic upgrade head`).

1. **Start DB + Redis** (backend expects `REDIS_URL` when you run the API against Docker services):  
   `docker compose up -d postgres redis`
2. **Backend:**  
   Copy `.env.example` to `.env` (or `backend/.env`). Then:
   - `cd backend` → `pip install -r requirements.txt`
   - `alembic upgrade head`
   - `uvicorn app.main:app --reload --port 8000`
3. **Frontend:**  
   Copy `frontend/.env.example` to `frontend/.env`, set `VITE_API_BASE_URL=http://localhost:8000`.  
   `cd frontend` → `npm install` → `npm run dev`
4. **Open:** http://localhost:5173  
   Create a tenant (e.g. via `POST /api/v1/tenants` at http://localhost:8000/docs), then register a user and log in.

See **`docs/BUILD_VERIFICATION.md`** for the B1–B3 checklist.

---

## Run with Docker (development)

- Prefer **`docker compose up -d`** (or `docker compose up`) so **Redis** starts with Postgres and the backend. The API **`/health`** checks Redis; if Redis is down, health checks can hang or fail and the backend may stay **unhealthy**.
- First time or after Dockerfile/dependency changes: `docker compose up --build -d`
- Normal dev (background): `docker compose up -d` — same as `docker compose up` but detached.
- Logs in the terminal: `docker compose up` (no `-d`).
- Frontend: http://localhost:5173 | Backend docs: http://localhost:8000/docs
- Migrations when schema changes: `docker compose exec backend alembic upgrade head`

---

## Production deployment (live server)

### 1. Server preparation

- Install **Python 3.12**, **Node.js 20** (for build), **PostgreSQL 16** (and optionally Redis 7).
- Create a system user and app directory, e.g. `/var/www/p7erp` or `~/p7erp`.
- Clone repo and use a dedicated branch/tag for releases.

### 2. Database

- Create PostgreSQL database and user. Example:
  - DB name: `p7erp`
  - User: `p7erp` (or your choice) with password.
- Set `DATABASE_URL=postgresql://user:password@localhost:5432/p7erp` (or your host/port).

### 3. Backend

```bash
cd backend
python3.12 -m venv venv
# Linux/macOS: source venv/bin/activate
# Windows: venv\Scripts\activate
pip install -r requirements.txt
```

- Copy `.env.example` to `.env` (in repo root or `backend/`). Set at least:
  - `DATABASE_URL`
  - `JWT_SECRET` (long random string)
  - `CORS_ORIGINS` (e.g. `https://yourdomain.com`)
- Run migrations: `alembic upgrade head`
- Run with Uvicorn (example):
  - `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - For production, use a process manager (systemd, supervisord) or Gunicorn with Uvicorn workers; ensure env is loaded.

### 4. Frontend build

```bash
cd frontend
cp .env.example .env
# Edit .env: VITE_API_BASE_URL=https://api.yourdomain.com  (or your backend URL)
npm ci
npm run build
```

- Build output: `frontend/dist/` (static files).

### 5. Serving the app

- **Option A – Nginx (recommended):**
  - Nginx listens on 80/443 (SSL), proxies `/api` (and optionally `/api/v1`) to `http://127.0.0.1:8000`.
  - Serve static files from `frontend/dist/` for `/` (e.g. `root /var/www/p7erp/frontend/dist; try_files $uri $uri/ /index.html;`).
- **Option B – FastAPI only:**  
  Mount the frontend build on the FastAPI app (e.g. mount `frontend/dist` at `/`) and run a single process. Use only if you don’t need a separate reverse proxy.

### 6. Production checklist

- [ ] `JWT_SECRET` and (if used) `AI_CONFIRMATION_TOKEN_PEPPER` set to strong random values.
- [ ] `CORS_ORIGINS` set to your frontend origin(s).
- [ ] PostgreSQL accessible only from app server (firewall/security groups).
- [ ] HTTPS in front of the app (Nginx/Caddy with SSL).
- [ ] Migrations run after each deploy: `alembic upgrade head`.
- [ ] Backend health: `GET /health` returns `{"status":"ok"}`.

---

## Tenant type

Each tenant is one of: **manufacturer** | **buying_house** | **both**. This controls module visibility and API access. Login uses Company Code (or Tenant ID) + Username/Email + Password; tenant is resolved by `company_code`.

---

## Quick reference

| Task | Command |
|------|---------|
| Backend deps | `cd backend` → `pip install -r requirements.txt` |
| Migrations | `cd backend` → `alembic upgrade head` |
| Backend run (dev) | `cd backend` → `uvicorn app.main:app --reload --port 8000` |
| Backend run (prod) | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| Frontend build | `cd frontend` → `npm ci` → `npm run build` |
| Frontend dev | `cd frontend` → `npm run dev` |
| Docker dev | `docker compose up` |
| Docker migrations | `docker compose exec backend alembic upgrade head` |

---

## Docs

- **Build verification:** `docs/BUILD_VERIFICATION.md`
- **Reference parity / plans:** `docs/REFERENCE_PARITY.md`, `docs/PROJECT_PLAN.md`
- **Finance UAT / go-live:** `docs/FINANCE_UAT_CHECKLIST.md`, `docs/FINANCE_GO_LIVE_CRITERIA.md`, `docs/FINANCE_CUTOVER_PLAN.md`
