# P7 ERP

Multi-tenant SaaS ERP for garments (manufacturing and buying house).  
**Reference:** PrimeX (replit-legacy) – same workflows. **Stack:** Python (FastAPI) + React (TypeScript).

---

## Technical summary (for live server deployment)

| Layer | Technology | Version / notes |
|-------|------------|-----------------|
| **Backend** | Python | 3.12 |
| | Framework | FastAPI 0.115.x |
| | ASGI server | Uvicorn 0.32.x |
| | ORM | SQLAlchemy 2.x (async) |
| | DB driver | asyncpg |
| | Migrations | Alembic 1.14.x |
| | Auth | JWT (python-jose), bcrypt |
| **Frontend** | Node | 20 LTS (for build) |
| | Runtime | React 18, TypeScript 5.6 |
| | Build tool | Vite 6.x |
| | UI | Tailwind CSS 3.x, Radix UI, Lucide icons |
| **Database** | PostgreSQL | 16 (recommended; 14+ supported) |
| **Optional** | Redis | 7 (sessions/cache; optional) |

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

1. **Start DB (and optional Redis):**  
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

- First time or after Dockerfile/dependency changes: `docker compose up --build`
- Normal dev: `docker compose up`
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
