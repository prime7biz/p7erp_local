# P7 ERP — Standard Deployment Process

**For beginners:** Say **"deploy"** once in Cursor. The agent runs every safety gate below in order.
If any gate fails, it stops and tells you exactly what happened. The live server is changed only at the very end, and only after every earlier gate passes.

Rules: `.cursor/rules/deployment-process.mdc` (agent steps). Gate script: `scripts/release/release_gate.ps1` (read-only checks).

---

## What "deploy" does

| Gate | What is checked or done | If it fails |
|------|-------------------------|-------------|
| 0 Preflight | On branch `dev`, clean tree (or you approve the listed commit), no secret files, not behind origin, Python import + frontend build | Stop |
| 1 Dev | Push `dev`; GitHub **CI** passes on that exact commit | Stop. `main` untouched |
| 2 Main | Fast-forward `main` to that commit; **CI** passes on `main` | Stop before any tag |
| 3 Backup | Production PostgreSQL backup, only when a migration or data risk exists | Stop before any tag |
| 4 Tag and images | Create `vX.Y.Z` on `main`; **Deploy** publishes all three immutable Docker Hub images | Stop. Live untouched |
| 5 Live | `scripts/deploy_production_remote.sh vX.Y.Z` over SSH | Script recovery rules below |
| 6 Verify | Live backend `/health` reports `vX.Y.Z`; smoke checks | Report and follow rollback |

Nothing reaches production unless `dev` CI, `main` CI, the backup (when needed), and the image check all pass.
GitHub never SSHes to the server. Only the deploy script changes live services.

---

## Safety rules

- Only the application services change: backend, worker, beat, frontend. PostgreSQL, Redis, Ollama and Watchtower are never recreated by a release.
- Images use immutable version tags. Production never uses `latest`.
- A version tag is used once. A tag is always on `main`.
- Before a migration, a database backup must succeed.
- Expect a short restart window (backend and Celery restart). Health checks reduce the impact but do not promise zero downtime.

---

## One-time GitHub setup (repository owner)

Not configured yet. The release flow still works without it, but these settings make the protection real:

1. **Main protection ruleset** on `main`: require the CI checks (`Tests / Backend Tests (Python)`, `Tests / Frontend Tests (Node.js)`, `Tests / Frontend Admin Checks (Node.js)`, `Docker Compose Validation`); block force pushes and branch deletion.
2. Optional stricter flow: require a pull request into `main` and enable auto-merge. This needs a GitHub login with permission to open PRs (`gh auth login`), and the release flow then uses the PR instead of the direct fast-forward push.
3. Keep Docker Hub and SSH credentials only with the people who release.

---

## Manual fallbacks (never used by pushes)

| Workflow | Use |
|----------|-----|
| **Deploy** (manual run) | Dry run only: runs tests and builds, pushes nothing. Refused unless run from `main`. |
| **Docker Hub Build (Manual Fallback)** (`docker-build.yml`) | Publishes an existing `vX.Y.Z` tag again. Never moves `:latest`. |
| **Build and Push Admin UI (Manual)** (`deploy-admin.yml`) | Publishes only `prime7biz/p7erp-frontend-admin:<tag>`. Never moves `:latest`. |

---

## Check a gate by hand

From the repository root (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 preflight
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 ci <full-commit-sha>
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 on-main <full-commit-sha>
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 tag-free v1.26.0
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 images v1.26.0
powershell -ExecutionPolicy Bypass -File scripts\release\release_gate.ps1 live-version v1.26.0
```

Exit codes: `0` PASS, `1` FAIL, `2` timeout, `3` needs your decision (uncommitted changes), `4` could not verify.

---

## Live server script (`scripts/deploy_production_remote.sh vX.Y.Z`)

It takes a lock so only one deploy runs at a time, then:

1. Pulls only the backend and frontend images for `vX.Y.Z`.
2. Checks that PostgreSQL, Redis and Ollama are healthy. If not, it stops before any change.
3. Compares the database migration revision with the new image's head.
4. Stops **beat**, waits for Celery to drain (`DRAIN_TIMEOUT_SECONDS`, default 900 s), then stops **worker**.
5. Writes the new image pins to `.env` atomically, keeping every other setting.
6. Starts **backend** (applies migrations), waits for `/health` and checks the version.
7. Starts **worker** and **beat**, then replaces **frontend**.

**Failure rules:**

| Where it fails | What happens |
|----------------|--------------|
| Before the image pins change (infrastructure unhealthy, Celery does not drain) | Nothing changes. Beat and worker are restarted on the current release. Exit 1. |
| After the pins change, and no migration could have run | The previous pins from `.env.previous-release` are restored and the previous release is started. Exit 1. |
| After the pins change, and a migration ran (or its status is unknown) | Worker and beat stay **stopped on purpose** so old code never runs on a migrated schema. The script prints recovery steps: restore the pre-release backup, then the pins. |

---

## Backend runs as a non-root user (`RUN_AS_NON_ROOT`)

The backend image has an unprivileged user **`app` (uid/gid 10001)**. The `backend`, `worker`
and `beat` containers start as root only long enough for `backend/docker-entrypoint.sh` to:

1. check that `/app/media` (uploads + the beat schedule file `celerybeat-schedule`) and
   `/app/backups` belong to `app`, and `chown` them **only if something is not** (files written
   by older root-only images);
2. switch to `app` and start the normal command (`alembic upgrade head && uvicorn ...`,
   `celery worker`, `celery beat`).

| Setting | Default | Meaning |
|---------|---------|---------|
| `RUN_AS_NON_ROOT` | `true` in `docker-compose.prod.yml`, `false` in `docker-compose.yml` (dev) | `false` = run as root like before |

**First deploy with this change:** nothing to do by hand. On the first start the entrypoint logs
`docker-entrypoint: fixing ownership of /app/media ...` and fixes the `backend_media` volume once
(about 1 second per ~20,000 files in testing). Later restarts only check (no change, ~1 s).
No extra downtime beyond the normal container restart.

If a folder still is not writable (for example a read-only mount), the entrypoint logs
`WARNING: falling back to root` and runs as root, so uploads and beat keep working.
Check after deploy:

```bash
cd /home/primeadmin/p7erp_local
docker compose -f docker-compose.prod.yml logs backend worker beat | grep docker-entrypoint
docker compose -f docker-compose.prod.yml top backend      # UID column should show 10001
```

**Manual fallback** (only if the logs show a WARNING): fix ownership once, then restart.

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -u root --entrypoint chown backend -R 10001:10001 /app/media
docker compose -f docker-compose.prod.yml up -d backend worker beat
```

(Same as `chown -R 10001:10001 /var/lib/docker/volumes/p7erp_local_backend_media/_data` on the host.)

**`docker compose exec` still enters as root.** Scripts that write files under `/app/media`
should run as the app user so new files are not root-owned:
`docker compose -f docker-compose.prod.yml exec -u app backend python scripts/<script>.py`.
(Root-owned files are fixed again on the next container start anyway.)

**Rollback:** add `RUN_AS_NON_ROOT=false` to the server `.env` and run
`docker compose -f docker-compose.prod.yml up -d backend worker beat` (back to root; files owned
by 10001 are still readable/writable by root), or redeploy the previous image tag.

---

## Server tuning: Postgres, DB pools, Celery, schedulers

All values below have safe defaults in `docker-compose.prod.yml` / `backend/app/config.py`.
You do **not** need to add anything to the live `.env`; add a line only to override a default.

### Postgres restart (first deploy after the tuning change)

`docker-compose.prod.yml` now starts Postgres with tuned memory settings. Because the
Postgres `command:` changed, the next `docker compose -f docker-compose.prod.yml up -d`
(run by `scripts/deploy_production_remote.sh`) **recreates the Postgres container once**.
Data is safe (it lives in the `postgres_data` volume) but the site is **down for roughly
10–30 seconds** while Postgres restarts and the backend reconnects. Deploy at a quiet time
and take the usual backup first.

If Postgres does not come back (`docker compose -f docker-compose.prod.yml logs postgres`
shows a memory error), lower `PG_SHARED_BUFFERS` (e.g. `256MB`) in `.env` and run `up -d` again.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PG_SHARED_BUFFERS` | `512MB` | Postgres page cache (~25% of RAM left after Ollama/API) |
| `PG_EFFECTIVE_CACHE_SIZE` | `1536MB` | Planner hint for OS + Postgres cache |
| `PG_WORK_MEM` | `8MB` | Per sort/hash step (multiplies with concurrent queries) |
| `PG_MAINTENANCE_WORK_MEM` | `128MB` | VACUUM / CREATE INDEX memory |
| `PG_MAX_CONNECTIONS` | `100` | Hard cap on DB connections |
| `PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT` | `0` (off) | Keep 0: background jobs hold an advisory-lock connection idle inside a transaction |
| `PG_RANDOM_PAGE_COST` | `1.1` | SSD storage |
| `PG_SHM_SIZE` | `256mb` | `/dev/shm` for parallel queries (Docker default 64 MB is too small) |

### pg_stat_statements (one-time, after the Postgres restart)

The library is preloaded, but the extension must be created once per database
(idempotent — safe to run again):

```bash
cd /home/primeadmin/p7erp_local
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"'
# Top 10 slowest queries (total time):
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time) AS mean_ms, left(query, 80) FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;"'
```

### DB connection pools (per process)

Each uvicorn worker and each Celery child process has its **own** pool.
Budget = API `2 x (10 + 10)` + worker `CELERY_CONCURRENCY x (2 + 3)` + beat `1 + 1` ≈ 52, under `PG_MAX_CONNECTIONS=100`.

| Variable | Default | Applies to |
|----------|---------|------------|
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `10` / `10` (was 20 / 30) | API (backend) |
| `CELERY_DB_POOL_SIZE` / `CELERY_DB_MAX_OVERFLOW` | `2` / `3` | Celery worker children |
| (fixed) | `1` / `1` | Celery beat |
| `PERF_SESSION_STATEMENT_TIMEOUT_MS` / `PERF_SESSION_LOCK_TIMEOUT_MS` | `0` (off) | Set once per connection; with `USE_PGBOUNCER=true` they are `SET LOCAL` per request instead. When on, they also apply to background jobs. |

If logs show `QueuePool limit ... reached`, raise `DB_POOL_SIZE` a little and keep the budget under `PG_MAX_CONNECTIONS`.

### Celery worker

| Variable | Default | Meaning |
|----------|---------|---------|
| `CELERY_CONCURRENCY` | `2` | Worker processes (was: one per CPU) |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | `1` | Reserve one task at a time |
| `CELERY_WORKER_MAX_TASKS_PER_CHILD` | `200` | Recycle child processes (frees leaked memory); `0` = never |
| `CELERY_TASK_SOFT_TIME_LIMIT_SECONDS` / `CELERY_TASK_TIME_LIMIT_SECONDS` | `3300` / `3600` | Soft / hard per-task limit; `0` = none |

### Housekeeping

| Variable | Default | Meaning |
|----------|---------|---------|
| `ALERT_SCAN_LOG_RETENTION_DAYS` | `30` | Hourly platform maintenance deletes older `alert_scan_log` rows in 5,000-row batches; `0` = keep forever |
| `ALERT_SCAN_LOG_PURGE_BATCH_SIZE` | `5000` | Rows per delete batch (not passed by compose; set in config only if needed) |

Platform maintenance still runs hourly, but the daily part (usage roll-up and the 1st-of-month
AI budget reset) now runs **once per day** instead of every hour.

### Moving scheduled jobs from the API to Celery beat (`INPROCESS_SCHEDULERS_ENABLED`)

Default `true`: merch alert scan (15 min), trade alert scan (daily), weekly AI report
(Sunday 02:00 UTC) and platform maintenance (hourly) run inside the API process.
Celery beat has the same four jobs ready and uses them only when the flag is `false`.

Switch to beat **only after** worker + beat are healthy:

```bash
cd /home/primeadmin/p7erp_local
docker compose -f docker-compose.prod.yml ps worker beat          # both "running"
docker compose -f docker-compose.prod.yml logs --tail=50 beat      # "beat: Starting..." and no errors
docker compose -f docker-compose.prod.yml exec -T worker \
  celery -A app.common.celery_app.celery_app inspect ping          # "pong"
echo "INPROCESS_SCHEDULERS_ENABLED=false" >> .env
docker compose -f docker-compose.prod.yml up -d backend worker beat
# Within ~15 minutes beat logs should show "Sending due task scheduled-merch-alert-scan".
docker compose -f docker-compose.prod.yml logs --since 20m beat | grep scheduled-
```

Rollback: remove the line from `.env` (or set it to `true`) and run the same `up -d` command.
Never run both: the flag decides which scheduler owns the jobs.

### Portal refresh token in an HttpOnly cookie (`AUTH_REFRESH_COOKIE_ENABLED`)

Default `false` = unchanged behaviour. Full explanation, CSRF design and Nginx requirements:
`docs/FRONTEND_SECURITY_HEADERS.md` → *Login tokens and the HttpOnly refresh cookie*.

| Variable | Default | Meaning |
|----------|---------|---------|
| `AUTH_REFRESH_COOKIE_ENABLED` | `false` | `true` = portal login/refresh set the refresh token as an HttpOnly cookie |
| `AUTH_COOKIE_SECURE` | `true` | Cookie only over HTTPS. Keep `true` on the live server |
| `AUTH_COOKIE_SAMESITE` | `strict` | Needs frontend and API on one site (`prime7erp.com`) |
| `AUTH_COOKIE_DOMAIN` | empty | Empty = API host only. Set `.prime7erp.com` only for a split API host |

Rollout: (1) deploy the release with the flag off; (2) then turn it on:

```bash
cd /home/primeadmin/p7erp_local
echo "AUTH_REFRESH_COOKIE_ENABLED=true" >> .env
docker compose -f docker-compose.prod.yml up -d backend
```

Check: portal login at https://prime7erp.com → DevTools → Application → Cookies shows
`p7_ext_refresh` (HttpOnly, Secure, SameSite Strict); Local Storage has no `p7_ext_refresh_token`;
portal logout removes the cookie. Host Nginx must not hide or strip `Set-Cookie` / `Cookie` on `/api/`.
(3) A later release removes the body refresh token.

Rollback: set the line to `false` (or remove it) and run the same `up -d backend`. Portal users in
cookie mode log in again once when their access token expires.

### ZKTeco cloud push for attendance machines (`/iclock/*`)

ZKTeco machines with a "Cloud Server / ADMS" setting call `/iclock/cdata` and `/iclock/getrequest`
on the server (fixed paths). The frontend Nginx (`frontend/nginx.prod.conf`) proxies `/iclock/` to
the backend. A device is accepted only when HR has filled in **both** its serial number and its
allowed IPs on **HR → Attendance Devices**, so nothing changes until a company configures a machine.

| Variable | Default | Meaning |
|----------|---------|---------|
| `ATTENDANCE_ICLOCK_ENABLED` | `true` | `false` = `/iclock/*` answers 404 for everyone (kill switch) |
| `ATTENDANCE_ICLOCK_RATE_LIMIT_PER_DEVICE_PER_MINUTE` | `600` | Per serial number (Redis, else per process). 0 = no limit |
| `ATTENDANCE_ICLOCK_RATE_LIMIT_PER_IP_PER_MINUTE` | `1200` | Per client IP. 0 = no limit |

Host Nginx: many machines only speak plain HTTP for cloud push. If the host redirects all HTTP to
HTTPS, add an exception for `location /iclock/ { proxy_pass http://127.0.0.1:5173; ... }` in the
port-80 server block (keep `X-Forwarded-For`), or use machines that support HTTPS. The allowed-IP
check uses the right-most **public** IP in `X-Forwarded-For`, so machines on a private LAN talking
to an on-premise server cannot be matched (use the `X-Device-Key` push with a bridge there).

Paths the frontend container (`frontend/nginx.prod.conf`) proxies to the backend: `/api/`, `/iclock/`,
`/media/` and `/health` (footer platform status); everything else is the React app.

---

## Rollback

**App only (no DB change):**

```bash
# In server .env, set previous image tags:
BACKEND_IMAGE=prime7biz/p7erp-backend:v1.4.0
FRONTEND_IMAGE=prime7biz/p7erp-frontend:v1.4.0
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**After a bad migration:** restore PostgreSQL backup + redeploy previous image tags. Optional: `alembic downgrade -1` (repeat) only if downgrade is safe for that revision.

---

## Quick reference

| Say in Cursor | Agent does |
|---------------|------------|
| **deploy** | Full checklist: pre-flight → commit → push → CI → tag → monitor → smoke → report |
| **verify the build** | Local pre-flight only (no git push) |
| **commit** | Git commit only (no deploy) |
