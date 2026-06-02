# Database performance rollout — rollback runbook

Use this after each performance-related PR or production change. All backend commands assume **Docker** (`docker compose exec backend …`).

## 1. API / Python-only regression

```bash
git revert <merge_commit_sha>
# open PR with revert, merge, deploy as usual
```

Verify:

```bash
docker compose exec backend python -c "import app.main"
```

## 2. Alembic migration (indexes / new tables)

**Upgrade (normal deploy):**

```bash
docker compose exec backend alembic upgrade head
```

**Rollback one revision** (only if the migration has a working `downgrade()`):

```bash
docker compose exec backend alembic downgrade -1
```

**Non-prod verification loop:**

```bash
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic upgrade head
```

Inventory snapshot + payroll index: revision **`177`** — `downgrade()` drops the new index and the `inventory_stock_balance_snapshots` table.

## 3. Feature flags (`tenants.feature_flags`)

Example: stock snapshot reads (`stock_snapshot_reads`).

- Turn **off** in Settings / tenant JSON or SQL update, then restart backend if you cache flags in-process (this app reads JSON per request — usually no restart).
- Rebuild snapshots are safe to leave in the table; reads fall back to live movements when the flag is false or the table is empty.

Rebuild script (after flag off, data harmless):

```bash
docker compose exec backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id <ID>
```

## 4. Environment — DB pool (`DB_POOL_*`)

Tuned only via host `.env` / compose env (defaults unchanged in code):

| Variable | Role |
|----------|------|
| `DB_POOL_SIZE` | Base pool size |
| `DB_MAX_OVERFLOW` | Extra connections under burst |
| `DB_POOL_TIMEOUT` | Wait for a connection (seconds) |
| `DB_POOL_RECYCLE` | Recycle connections after N seconds |

**Rollback:** restore previous values and `docker compose restart backend` (or full stack).

## 5. Observability flags (no schema change)

| Variable | Effect |
|----------|--------|
| `PERF_TIMING_ENABLED` | Log slow requests (see `RequestLoggingMiddleware`) |
| `PERF_TIMING_SLOW_MS` | Threshold for slow log (default 750) |
| `PERF_POOL_METRICS_ENABLED` | Append pool stats to slow-request log line |
| `PERF_REQUEST_QUERY_WARN_BYTES` | Warn on oversized query string |
| `PERF_SESSION_STATEMENT_TIMEOUT_MS` | `SET LOCAL statement_timeout` per request (0 = off) |
| `PERF_SESSION_LOCK_TIMEOUT_MS` | `SET LOCAL lock_timeout` per request (0 = off) |

**Rollback:** set flags to `false` / `0` and restart backend.

## 6. Staged rollout checklist

1. Merge to a feature branch → PR → review.
2. `docker compose exec backend pytest <relevant tests> -q`
3. Apply migration on staging → smoke test inventory + HR payroll reports.
4. Merge to `main` → watch logs 15–30 minutes.
5. If any regression: execute the matching section above.

## References

- Baseline template: [docs/perf_baseline_2026-05-13.md](perf_baseline_2026-05-13.md)
- Pool wiring: `backend/app/database.py`
- Platform pool snapshot: `GET` … `/monitoring/system/db-stats` (admin JWT)
