# P7 ERP Load Testing

Load test the ERP backend with **Locust** running inside Docker alongside the
existing services.

---

## Quick start

### 1. Point Locust at a real tenant and user

You need at least one **tenant** and **user** in the database.

Copy `.env.example` to `.env` (if you have not already), then set these in
`.env` at the project root:

```env
LOADTEST_COMPANY_CODE=your_company_code
LOADTEST_USERNAME=your_username
LOADTEST_PASSWORD=your_password
```

Defaults are `DEMO` / `admin` / `admin123` if you omit them (only works if
your database matches). For several rotating users, set `LOADTEST_USERS_JSON`
(see comments in `.env.example`).

### 2. Start the stack (backend + Locust)

From the project root, use **one** of these:

**Load test only (recommended):** starts Postgres, Redis, backend, and Locust.
Skips the frontend image build (faster; avoids frontend `npm run build` if it fails).

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --build postgres redis backend locust
```

**Full stack:** also builds and starts the frontend (needs a successful frontend build).

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up --build
```

This starts:

| Service    | URL                        | Purpose                           |
|------------|----------------------------|-----------------------------------|
| backend    | http://localhost:8000       | FastAPI (8 workers in overlay, no reload) |
| postgres   | localhost:5432              | PostgreSQL (tuned; max_connections=300 in overlay) |
| redis      | localhost:6379              | Redis cache                       |
| frontend   | http://localhost:5173       | React app (optional for load test) |
| **locust** | **http://localhost:8089**   | **Load test dashboard**           |

### 3. Run the test

1. Open **http://localhost:8089** in your browser.
2. Set the parameters:
   - **Number of users**: start with **10**, then increase.
   - **Spawn rate**: how many users to add per second (e.g. 5).
3. Click **Start swarming**.

### 4. Progressive ramp-up (recommended)

Don't jump straight to 1000 users. Increase step by step:

| Stage | Users | Spawn rate | Duration | What to watch              |
|-------|-------|-----------|----------|----------------------------|
| 1     | 10    | 5/s       | 2 min    | Everything green?          |
| 2     | 50    | 10/s      | 3 min    | Response times < 500ms?    |
| 3     | 200   | 20/s      | 5 min    | Any 500 errors?            |
| 4     | 500   | 30/s      | 5 min    | DB connection errors?      |
| 5     | 1000  | 50/s      | 10 min   | Full load — what breaks?   |

Click **Stop** between stages, then **New test** with higher numbers.

### Uvicorn workers

The load-test compose file runs the API with **`--workers 8`**. On a small machine
you can lower this in `docker-compose.loadtest.yml`; on a larger host you can
raise it (a common rule of thumb is about **2 × CPU cores + 1** worker processes).

---

## What the test does

The `locustfile.py` simulates real ERP users:

- **Login** (once per user): `POST /api/v1/auth/login`
- **Read lists** (frequent): orders, employees, inventory items, vouchers,
  attendance, customers, inquiries, departments, stock summary, chart of
  accounts, warehouses
- **Create entries** (occasional): attendance entry
- **Health check**: `GET /health`

Read operations have much higher weight than writes (realistic ERP usage).

---

## Monitoring during the test

While Locust runs, open a second terminal and watch:

```bash
# Container CPU and memory usage
docker stats

# Backend logs (look for errors)
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml logs -f backend

# PostgreSQL active connections
docker compose exec postgres psql -U p7erp -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## What the loadtest compose file changes

The `docker-compose.loadtest.yml` overlay makes three changes vs the base
`docker-compose.yml`:

1. **Backend**: 4 Uvicorn workers (no `--reload`), larger DB pool
   (`DB_POOL_SIZE=20`, `DB_MAX_OVERFLOW=40`).
2. **PostgreSQL**: `max_connections=300` (default is 100).
3. **Locust service**: official `locustio/locust` image on port 8089.

These settings are **only active when you include the loadtest file**. Your
normal `docker compose up` is unaffected.

---

## Understanding the results

| Metric             | Good               | Warning              | Bad                    |
|--------------------|--------------------|----------------------|------------------------|
| Median response    | < 200ms            | 200–1000ms           | > 1000ms               |
| 95th percentile    | < 500ms            | 500–2000ms           | > 2000ms               |
| Failure rate       | 0%                 | < 1%                 | > 1%                   |
| Requests/sec       | Scales with users  | Plateaus early       | Drops under load       |

### Common problems and fixes

| Problem                            | Cause                          | Fix                                  |
|------------------------------------|--------------------------------|--------------------------------------|
| 401 on `/auth/login`               | Wrong `LOADTEST_*` credentials | Set real `company_code`, user, password in `.env`; recreate Locust |
| 422 on `POST .../attendance/entries` | Old Locust body used wrong field names | Use current `locustfile.py` (`attendance_date`, `in_time`, `out_time`) |
| 404 on `POST .../attendance/entries` | `employee_id` not in tenant    | Set `LOADTEST_EMPLOYEE_ID` to an id from `GET /api/v1/hr/employees` |
| Response times climb over 2s       | Too few Uvicorn workers        | Increase `--workers` in compose      |
| "Connection pool exhausted"        | DB pool too small              | Increase `DB_POOL_SIZE` env var      |
| PostgreSQL "too many connections"  | Postgres limit hit             | Increase `max_connections` in compose |
| 500 errors on write endpoints      | Race conditions / deadlocks    | Add DB-level locking or retry logic  |
| CPU 100% on backend container      | Compute-bound (JWT, bcrypt)    | More workers or scale horizontally   |

---

## Cleanup

Stop the test and all containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml down
```

To go back to normal development:

```bash
docker compose up
```
