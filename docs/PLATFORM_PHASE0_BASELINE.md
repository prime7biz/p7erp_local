# Platform Phase 0 — Engineering Baseline

**Date:** 2026-06-28  
**Environment:** Local Docker (`docker compose`)

## Build & test evidence

| Check | Result | Notes |
|-------|--------|-------|
| Backend `pytest` (full) | **PASS** | 370 passed, 3 skipped (2026-06-28) |
| Backend `import app.main` | **PASS** | Docker container |
| Gap Register | **PASS** | `docs/PLATFORM_GAP_REGISTER.md` |
| Route inventory | **PASS** | No `AppComingSoonPage` wired in router |
| Alembic head | Run `docker compose exec backend alembic current` before deploy | |

## Commands (repeat before each release)

```powershell
docker compose exec backend pytest -q
docker compose exec backend python -c "import app.main"
docker compose exec backend alembic upgrade head
cd frontend; npm run lint; npm run build; npm test
```

## Related docs

- [PLATFORM_GAP_REGISTER.md](./PLATFORM_GAP_REGISTER.md)
- [GO_LIVE_UAT_EVIDENCE.md](./GO_LIVE_UAT_EVIDENCE.md)
- [GO_LIVE_READINESS_BOTH_TENANT_TYPES.md](./GO_LIVE_READINESS_BOTH_TENANT_TYPES.md)
