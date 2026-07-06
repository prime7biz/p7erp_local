# Load Test Runbook

Target: validate p95 latency before large multi-tenant rollout.

## Prerequisites

- Docker compose running with backend + postgres
- Test tenant with demo data (`seed_lakhsma_interconnected_demo.py`)
- Set in `.env`: `LOADTEST_COMPANY_CODE`, `LOADTEST_USERNAME`, `LOADTEST_PASSWORD`

## Run Locust

```powershell
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up
```

Open http://localhost:8089 — start with 50 users, ramp to 200, hold 10 minutes.

## Pass criteria

| Metric | Target |
|--------|--------|
| p95 GET list APIs | < 2000 ms |
| Error rate | < 1% |
| Login success | 100% |

## Background jobs

Verify no double-runs with multiple uvicorn workers (`backend/app/common/background_lock.py`).

## After failures

1. Check slow-request logs (`PERF_TIMING_ENABLED=true`)
2. Add indexes per `docs/PERF_ROLLBACK_RUNBOOK.md`
3. Re-run until pass
