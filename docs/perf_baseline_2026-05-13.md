# Performance baseline — 2026-05-13

This document satisfies **Phase 0** of the Database Performance Acceleration Plan: methodology, default SLO targets, and a **static codebase audit** of likely hotspots. Live numbers (`pg_stat_statements`, production `EXPLAIN ANALYZE`) must be captured on your server and merged into the “Measured top queries” section before treating this as a signed-off baseline.

## 1. How to capture live baselines (read-only)

Run on PostgreSQL (read-only; no schema changes):

```sql
-- If extension exists:
SELECT query, calls, mean_exec_time, total_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

For each hotspot SQL fingerprint, run:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <your parameterized query>;
```

Map each fingerprint back to the FastAPI route using logs (see **Phase 1** `PERF_TIMING_ENABLED` in `backend/app/config.py` and `RequestLoggingMiddleware`).

## 2. Default SLO targets (adjust per tenant)

| Family | p95 target | Notes |
|--------|------------|--------|
| Simple list (paginated JSON) | &lt; 400 ms | Includes ORM + JSON |
| Heavy list (joined inventory) | &lt; 800 ms | Stock, ledger-style |
| Aggregate report (SQL counts) | &lt; 1200 ms | HR summary, finance aging |
| Export / batch | &lt; 30 s | Must be capped + user-visible truncation |

## 3. Static audit — likely hotspots (code-derived)

These are **candidates** for `EXPLAIN` and index work, not confirmed slow queries.

| Area | Location | Risk |
|------|----------|------|
| Stock summary legacy path | `backend/app/modules/inventory/router.py` — `_stock_summary_rows`, callers `by-group`, `by-warehouse`, `overview`, WIP, MO KPI | Full-tenant aggregate + full Item/Warehouse maps (mitigated in this pass for Item/Warehouse fetch) |
| Stock summary paginated | Same module — `_stock_summary_page_sql` | Already SQL-paginated; good reference implementation |
| HR reports masters | `backend/app/modules/hr_reports/router.py` — `/leave` (LeaveType), `/payroll` (PayrollPeriod) | Unbounded master reads capped in this pass |
| HR attendance masters | `backend/app/modules/hr_attendance/router.py` — `/overtime-rules` | Unbounded list capped in this pass |
| Finance voucher lines | `backend/app/modules/finance/router.py` — many `select(VoucherLine).where(voucher_id==…)` | Per-voucher; index on `voucher_id` already exists |
| Payroll run lines | `hr_payroll_run_lines` | Composite `(tenant_id, run_id)` index added (concurrent) in migration `177` |

## 4. Existing tooling

| Tool | Path / route |
|------|----------------|
| Pool + host snapshot | `GET` monitoring routes in `backend/app/modules/admin/monitoring_router.py` (e.g. `db-stats`) |
| Request audit duration | `duration_ms` in `audit_logs` via `RequestLoggingMiddleware` |
| Pagination caps | `backend/app/common/pagination.py` |

## 5. Stop gate

Do **not** start destructive or high-blast-radius DB work until:

1. This file’s “Measured top queries” section is filled from production or staging, **or**
2. You explicitly accept static-audit-only baseline for a dev iteration.

### Measured top queries (fill on server)

Capture procedure (do this before adding more indexes):

1. Set briefly in `.env` / compose: `PERF_TIMING_ENABLED=true`, `PERF_TIMING_SLOW_MS=500`.
2. Exercise stock summary, voucher list, approvals, and order detail for ~15–30 minutes.
3. Run the `pg_stat_statements` query in §1 and map fingerprints to routes via slow-request logs.
4. Fill the table below; clear / disable PERF flags after capture if log volume is high.

| Rank | Query fingerprint | Endpoint | Calls / day | p95 ms | Notes |
|------|-------------------|----------|-------------|--------|-------|
| 1 | _(pending live capture)_ | Stock summary / valuation | — | — | Enable `stock_snapshot_reads` after rebuild+diff |
| 2 | _(pending live capture)_ | `GET /finance/vouchers` | — | — | Caps tightened toward MAX_PAGE_SIZE |
| 3 | _(pending live capture)_ | Approvals / available-actions | — | — | Batch endpoint preferred over N+1 |
| 4 | _(pending live capture)_ | Order related counts | — | — | Parallel/multi-count SQL |
| 5 | _(pending live capture)_ | Merch control tower | — | — | Count fan-out |

**Production capture without any config change** (read-only; `pg_stat_statements` is already preloaded by `docker-compose.prod.yml`). Run on the server, then fill the table above:

```bash
cd /home/primeadmin/p7erp_local
PSQL='docker compose -f docker-compose.prod.yml exec -T postgres sh -c'
# One time (idempotent):
$PSQL 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"'
# Optional: start a clean measurement window (only resets statistics, no data change):
$PSQL 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_stat_statements_reset();"'
# After a normal working day - top 15 by total time:
$PSQL 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time) AS mean_ms, left(query, 100) AS query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;"'
```

**Important (production env pass-through):** `docker-compose.prod.yml` only passes the variables it lists into the backend container; the server `.env` is used for `${...}` substitution, not loaded inside the container. `PERF_TIMING_ENABLED`, `API_CACHE_ENABLED` and `USE_PGBOUNCER` are **not** listed today, so putting them in the live `.env` has **no effect**. Using them in production first needs pass-through lines (for example `API_CACHE_ENABLED: ${API_CACHE_ENABLED:-false}`) added to the backend environment in `docker-compose.prod.yml`, which is a production compose change and should be its own reviewed release. `pg_stat_statements` and the tenant flag `stock_snapshot_reads` need no compose change.

### Local dev measurement (2026-11-06) - not a production baseline

Local demo tenant `LAKH806201` has very little data (41 vouchers, 72 stock movements), so these numbers only show per-request overhead. Seven requests per endpoint, first one discarded as warm-up, direct to the backend on `:8000`:

| Endpoint | Median ms | Max ms |
|----------|-----------|--------|
| `GET /api/v1/merch/control-tower/summary` | 111 | 123 |
| `GET /api/v1/orders/paginated` | 101 | 118 |
| `GET /api/v1/finance/vouchers` | 86 | 130 |
| `GET /api/v1/inventory/stock-summary` | 77 | 98 |
| `GET /api/v1/inventory/stock-summary/overview` | 49 | 75 |
| `GET /api/v1/finance/account-groups/hierarchy` | 47 | 50 |
| `GET /api/v1/inventory/stock-summary/by-warehouse` | 46 | 54 |
| `GET /api/v1/compliance/tax-config` | 41 | 56 |
| `GET /api/v1/inventory/stock-summary/by-group` | 37 | 41 |

Locally every single SQL statement took under 2 ms; most of the time is framework work per request (auth, tenant lookup, middleware). The statement with the highest total time was the `INSERT INTO audit_logs` written for every request (64 inserts for 63 requests). On production, check its share in the `pg_stat_statements` output above.

### Toggle validation (2026-11-06, local Docker)

Each toggle was switched on, compared with off (same tenant, same user, response bodies hashed), then switched back.

| Toggle | Result | Production readiness |
|--------|--------|----------------------|
| `API_CACHE_ENABLED=true` | Identical responses; tax-config and account-group hierarchy median 35 ms to 27 ms (about 23% faster); Redis keys `cache:tenant:<id>:...` created. | Safe, but needs the compose pass-through above before it can be turned on in production. Rollback: `false` + restart backend. |
| `stock_snapshot_reads` (tenant flag) | Rebuild `rows_written=21 diff_rows=0`; all four stock-summary endpoints return identical bodies; no speed difference with 72 movements (benefit grows with movement volume). | Ready: no compose change. Per tenant: rebuild with `--diff-check`, enable only when `diff_rows=0`. Rollback: remove the flag. |
| `USE_PGBOUNCER=true` | **Fails under concurrency**: 5 of 20 concurrent logins returned HTTP 500 (`asyncpg.exceptions.InvalidSQLStatementNameError`, prepared statements in PgBouncer transaction mode), even with one uvicorn worker. Same load with direct Postgres: 0 errors. | **Do not enable.** Needs a separate code fix in `backend/app/database.py` (unique prepared statement names / statement cache off) plus a load test first. |
| DB pool tuning (`DB_POOL_SIZE` / `DB_MAX_OVERFLOW`) | Not changed: no `QueuePool limit` warnings locally. | Only if production logs show `QueuePool limit ... reached`; keep the budget under `PG_MAX_CONNECTIONS` (see `docs/DEPLOYMENT_PROCESS.md`). |

## 5b. Stock snapshot rollout (ops)

Feature flag: `tenants.feature_flags.stock_snapshot_reads` (default **off**).

```powershell
# Rebuild snapshot for one tenant, then compare (local)
docker compose exec backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id <id> --diff-check
```

```bash
# Same on the production server (as the app user so nothing becomes root-owned)
docker compose -f docker-compose.prod.yml exec -u app backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id <id> --diff-check
```

Enable only when the output shows `diff_rows=0`.

Then set `stock_snapshot_reads: true` on that tenant’s `feature_flags` JSON. Rollback: set flag back to `false` (see [PERF_ROLLBACK_RUNBOOK.md](PERF_ROLLBACK_RUNBOOK.md)).

## 6. References

- [docs/PRE_PRODUCTION_AUDIT.md](PRE_PRODUCTION_AUDIT.md) — Finding #3 pagination history
- [docs/performance_pass_2.md](performance_pass_2.md) — Stock summary SQL path, deferred items
- [docs/PERF_ROLLBACK_RUNBOOK.md](PERF_ROLLBACK_RUNBOOK.md) — Rollback copy-paste steps
