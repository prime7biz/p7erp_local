# Go-Live Cutover Runbook

**Target:** Full big-bang production cutover  
**Deploy mechanism:** Git tag `v*` → `.github/workflows/deploy.yml` (build images, SSH, migrate, `docker compose -f docker-compose.prod.yml up -d`)

---

## T-7 days (preparation)

1. Complete `docs/GO_LIVE_UAT_EVIDENCE.md` automated section (done 2026-06-05).
2. Business executes manual UAT:
   - `docs/FINANCE_UAT_TEST_CASES.md`
   - `docs/HR_UAT_TEST_CASES.md`
   - `docs/TRADE_UAT_CHECKLIST.md`
   - `docs/INVENTORY_FINANCE_UAT.md`
3. Fill scorecard in `docs/GO_LIVE_READINESS_BOTH_TENANT_TYPES.md`.
4. Complete `docs/GO_LIVE_PRODUCTION_HARDENING.md` on staging that mirrors production.

---

## T-1 day

1. Freeze `main` except hotfixes.
2. Confirm production `.env` secrets (see hardening doc).
3. Tag release candidate: `vX.Y.Z-rc1` → deploy to staging; run smoke tests.
4. Notify users of maintenance window.

---

## Cutover day (ordered steps)

### 1. Final build verification

```powershell
# Local or CI
docker compose exec backend pytest -q
cd frontend; npm run build; npm test
```

### 2. Tag production release

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

This triggers deploy workflow: build/push images → SSH to server → `alembic upgrade head` → `docker compose -f docker-compose.prod.yml up -d`.

### 3. Post-deploy checks (within 15 minutes)

| # | Check | Pass |
|---|-------|:----:|
| 1 | `GET /health` returns 200 | ☐ |
| 2 | Login (company code + user) | ☐ |
| 3 | Dashboard loads | ☐ |
| 4 | Customers list | ☐ |
| 5 | Inventory stock summary | ☐ |
| 6 | Finance vouchers list | ☐ |
| 7 | HR employees list | ☐ |
| 8 | Trade cases (if buying house/both) | ☐ |
| 9 | External portal login (if enabled) | ☐ |
| 10 | Logout + re-login | ☐ |

### 4. Monitor (first 2 hours)

- API error rate / 5xx count
- Slow requests (optional `PERF_*` env logs)
- User-reported blockers via support tickets

---

## Rollback procedure

**If critical failure within maintenance window:**

1. Redeploy **previous** image tags on server:

   ```bash
   # On production host
   export BACKEND_IMAGE=prime7biz/p7erp-backend:<previous-tag>
   export FRONTEND_IMAGE=prime7biz/p7erp-frontend:<previous-tag>
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

2. If DB migration caused issue only:

   ```bash
   docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1
   ```

3. If specific module unstable: toggle tenant feature flags off (`trade_enabled`, portal flags) via Settings.

4. Document incident + root cause before re-attempt.

---

## Post go-live (week 1)

- [ ] Daily check: backups succeeded
- [ ] Finance month-end procedures per `docs/FINANCE_OPERATIONS_SOP.md`
- [ ] HR payroll run validated against finance vouchers
- [ ] Update `docs/GO_LIVE_UAT_EVIDENCE.md` with business sign-off names

---

## Quick reference

| Doc | Purpose |
|-----|---------|
| `GO_LIVE_READINESS_BOTH_TENANT_TYPES.md` | Module checklist by tenant type |
| `GO_LIVE_UAT_EVIDENCE.md` | Test evidence |
| `GO_LIVE_PRODUCTION_HARDENING.md` | Server secrets & infra |
| `PRODUCTION_READINESS_AUDIT.md` | Platform-wide gates |
| `FINANCE_CUTOVER_PLAN.md` | Finance-specific cutover |
| `HR_CUTOVER_PLAN.md` | HR-specific cutover |
