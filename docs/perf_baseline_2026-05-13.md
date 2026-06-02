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

| Rank | Query fingerprint | Endpoint | Calls / day | p95 ms | Notes |
|------|-------------------|----------|-------------|--------|-------|
| _ | _ | _ | _ | _ | Add rows from `pg_stat_statements` |

## 6. References

- [docs/PRE_PRODUCTION_AUDIT.md](PRE_PRODUCTION_AUDIT.md) — Finding #3 pagination history
- [docs/performance_pass_2.md](performance_pass_2.md) — Stock summary SQL path, deferred items
- [docs/PERF_ROLLBACK_RUNBOOK.md](PERF_ROLLBACK_RUNBOOK.md) — Rollback copy-paste steps
