# P7 ERP — Standard Deployment Process

**For beginners:** This is the step-by-step checklist for releasing code to the **live server** (https://prime7erp.com).

**In Cursor:** Say **"deploy"** and the agent follows `.cursor/rules/deployment-process.mdc` automatically.

**Related docs:** `docs/BUILD_VERIFICATION.md` (local build), `docs/GO_LIVE_CUTOVER_RUNBOOK.md` (full cutover), `docs/GO_LIVE_PRODUCTION_HARDENING.md` (server secrets).

---

## How deploy works (important)

| Action | What happens |
|--------|----------------|
| `git push origin main` | GitHub CI runs tests + builds Docker images. **Live server is NOT updated.** |
| `git push origin vX.Y.Z` | GitHub builds images, SSHs to server, pulls images, restarts containers, runs `alembic upgrade head`. **This updates production.** |

Workflow file: `.github/workflows/deploy.yml`

---

## Phase 0 — Pre-flight (local, before commit)

Run from repo root (`p7erp_local`):

```powershell
docker compose exec backend pytest -q
docker compose exec backend python -c "import app.main"
docker compose exec backend alembic current
cd frontend; npm run lint; npm run build
```

**Stop if anything fails.** Fix locally first.

---

## Phase 1 — Commit

Only commit `backend/`, `frontend/`, `docs/`. Never commit `.env`, `dist/`, `__pycache__/`, or `backend/media/`.

---

## Phase 2 — Push to main

```powershell
git push origin main
```

Wait for GitHub Actions **CI** to pass (green check on GitHub → Actions tab).

---

## Phase 3 — Pre-tag checklist

Before creating a version tag:

1. **Backup production database** (PostgreSQL snapshot on server or hosting panel).
2. **Pick version tag** (semver):
   - Patch: `v1.5.0` → `v1.5.1` (small fixes)
   - Minor: `v1.5.0` → `v1.6.0` (features, migrations, multi-module)
3. **Note rollback tag** (previous version, e.g. `v1.4.0`).

If this release adds Alembic migrations, backup is **mandatory** — deploy runs `alembic upgrade head` on live.

---

## Phase 4 — Tag and deploy to production

```powershell
git tag v1.5.1
git push origin v1.5.1
```

Replace `v1.5.1` with your chosen version. Monitor GitHub Actions → **Deploy** workflow.

---

## Phase 5 — Post-deploy smoke (within 15 minutes)

Open https://prime7erp.com and check:

| # | Check |
|---|-------|
| 1 | Login (company code + user) |
| 2 | Dashboard loads |
| 3 | Customers list |
| 4 | Inventory stock summary |
| 5 | Finance vouchers list |
| 6 | HR employees list |
| 7 | Trade cases (if buying house / both tenant) |
| 8 | API money fields still show as strings (e.g. `"100.5000"` in browser Network tab) |

On server (SSH), confirm migration:

```bash
docker compose -f docker-compose.prod.yml exec -T backend alembic current
# expect: <revision> (head)
```

---

## If GitHub SSH deploy fails

Docker images may still be built. Run manually on the server:

```bash
cd <DEPLOY_PATH>
git pull origin main
touch .env
sed -i '/^BACKEND_IMAGE=/d;/^FRONTEND_IMAGE=/d;/^APP_VERSION=/d' .env
echo "BACKEND_IMAGE=prime7biz/p7erp-backend:vX.Y.Z" >> .env
echo "FRONTEND_IMAGE=prime7biz/p7erp-frontend:vX.Y.Z" >> .env
echo "APP_VERSION=vX.Y.Z" >> .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

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
