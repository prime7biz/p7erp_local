# Go-Live Production Hardening Checklist

**Purpose:** Confirm the **live server** is safe before big-bang cutover.  
**Use with:** `docs/PRODUCTION_READINESS_AUDIT.md`, `docs/GO_LIVE_READINESS_BOTH_TENANT_TYPES.md`

Mark each item on the production host (not only local Docker).

---

## 1. Secrets (`.env` on server — never in Git)

- [ ] `JWT_SECRET` — strong, unique, not empty
- [ ] `MCP_HUMAN_APPROVAL_SECRET` — set (required by prod compose)
- [ ] `AI_CONFIRMATION_TOKEN_PEPPER` — set
- [ ] `DATABASE_URL` / Postgres credentials — production values
- [ ] `CORS_ORIGINS` — only real `https://` app origins (no `*` in production)
- [ ] `BACKEND_IMAGE` / `FRONTEND_IMAGE` — pinned image tags for deploy
- [ ] `SMTP_*` + `FRONTEND_URL` — if password reset / invites are used
- [ ] AI keys (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`) — only if features enabled

---

## 2. Bootstrap & registration lockdown

- [ ] `BOOTSTRAP_REGISTRATION_KEY` set **or** per-tenant bootstrap tokens configured
- [ ] Public `/register` cannot create tenants without the key
- [ ] First production admin users created and passwords rotated

---

## 3. Frontend build (immutable image)

- [ ] `VITE_API_BASE_URL` baked at **build time** for production domain (or empty for same-origin `/api`)
- [ ] `VITE_ALLOWED_HOSTS` includes live hostname
- [ ] Production frontend is **Nginx static** (`frontend/Dockerfile.prod`), not Node runtime

---

## 4. Networking & TLS

- [ ] Host Nginx owns **80/443** for `prime7erp.com`
- [ ] Containers use internal ports only (`5173:80` frontend, `8000:8000` backend)
- [ ] HTTPS works end-to-end; WebSocket upgrade for `wss://` if used
- [ ] `CORS_ORIGINS` matches browser origin exactly

---

## 5. Database & backups

- [ ] `alembic upgrade head` run on production DB (via deploy workflow or manual)
- [ ] Automated backup of `postgres_data` volume (or managed DB snapshots)
- [ ] Backup of `backend_media` volume (trade docs, uploads)
- [ ] **Restore drill** completed once and documented (who/when)

---

## 6. Background jobs (multi-worker)

- [ ] Backend runs with advisory-lock guarded schedulers (`app/common/background_lock.py`) so alert/trade/weekly jobs do not double-run across uvicorn workers

---

## 7. Feature flags (per tenant)

Configure in **Settings → Configuration** for each live tenant:

| Flag | Manufacturer | Buying house | Both |
|------|:------------:|:------------:|:----:|
| `trade_enabled` | off unless needed | on | on |
| `customer_portal_enabled` | optional | optional | optional |
| `financier_portal_enabled` | optional | on if using LC facilities | optional |
| `control_tower_enabled` | optional | optional | optional |

---

## 8. Operational contacts

- [ ] Support ticket path documented for users (`/app/support/tickets`)
- [ ] On-call / engineering contact for deploy rollback
- [ ] Log access procedure (API container logs, host Nginx)

---

## 9. Pre-cutover smoke (on production-like staging)

- [ ] Login with company code
- [ ] Customer list + one create/edit
- [ ] Inventory PO → GRN
- [ ] Voucher list (finance)
- [ ] HR employee list
- [ ] Trade case open (buying house / both)
- [ ] Logout / login again

---

## Rollback readiness

- [ ] Previous Docker image tags noted (`prime7biz/p7erp-backend:<tag>`, `prime7biz/p7erp-frontend:<tag>`)
- [ ] `git revert <sha>` plan if bad deploy
- [ ] `alembic downgrade -1` only if migration caused issue
- [ ] Feature flags can disable Trade / portals without code deploy

---

## Go-live remediation — Phase 7 (field updates)

**Added `PATCH` endpoints** (status/workflow transitions stay on existing `POST …/status`, `…/submit`, or `…/stage` routes):

| Module | New routes |
|--------|------------|
| HR performance | `PATCH /hr/performance/cycles/{id}`, `…/goals/{id}`, `…/reviews/{id}` |
| HR recruitment | `PATCH /hr/recruitment/requisitions/{id}`, `…/candidates/{id}`, `…/interviews/{id}`, `…/offers/{id}` |
| Manufacturing | `PATCH /manufacturing/master/routing-templates/{id}`, `…/routing-templates/{id}/steps/{step_id}` |

**Intentionally immutable (append-only or workflow-only):**

- **Employee documents** (`POST /hr/employees/{id}/documents` only) — compliance/audit trail; add a new document instead of editing.
- **Employee status history** (`POST /hr/employees/{id}/status-history` only) — historical record; corrections via a new history row.
- **Posted finance vouchers** and **closed accounting periods** — use reversal/adjustment flows, not field PATCH.
- **Routing template identity** — `item_id` and `version_no` are fixed at create; use a new template version for structural changes.

---

## Go-live remediation — Phase 8 (new tenant bootstrap)

**Admin-created tenants** now call `seed_tenant_system_coa` at create time (same as public `/api/v1/tenants` sign-up).

**Backfill / manual minimum seed** for tenants missing inventory/finance basics:

```bash
docker compose exec backend python scripts/seed_new_tenant_minimum.py --company-code <COMPANY_CODE>
```

The script is idempotent and ensures: global currencies, item categories/units, one warehouse (`WH-MAIN`), one open accounting period (current month), system roles (if missing), default non-admin role permissions, and system COA when absent.

**After deploy:** run the script once for any admin-created tenants that existed before this fix and were used for UAT/go-live.
