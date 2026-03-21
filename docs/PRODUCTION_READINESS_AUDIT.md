# P7 ERP — Production Readiness Audit

**Date:** 2026-03-22  
**Purpose:** A practical, checklist-style gate before you cut over real users to production.  
**How this fits with other docs:**

| Document | What it covers |
|----------|----------------|
| [`PRE_PRODUCTION_AUDIT.md`](./PRE_PRODUCTION_AUDIT.md) | Deep technical findings (data integrity, pagination, tenant isolation, frontend error handling) and fix status |
| [`BUILD_VERIFICATION.md`](./BUILD_VERIFICATION.md) | B1–B3: install deps, env, migrations, `npm run build` |
| [`FINANCE_GO_LIVE_CRITERIA.md`](./FINANCE_GO_LIVE_CRITERIA.md) | Finance module–specific hard/soft gates and UAT evidence |
| [`.cursor/rules/production-architecture.mdc`](../.cursor/rules/production-architecture.mdc) | Nginx, ports, compose vs host SSL, env assumptions |

Use this file for **“are we ready to ship the whole app?”** Use the others for **depth on a single area**.

---

## 1. Executive summary (fill before go-live)

| Area | Risk if skipped | Status (Pass / Fail / N/A) | Notes |
|------|-----------------|----------------------------|-------|
| Build & artifacts | Broken deploy, wrong API URL in UI | | |
| Secrets & env | Account takeover, data leaks | | |
| Database migrations | Schema drift, failed deploy | | |
| Tenant & bootstrap security | Cross-tenant access, open admin signup | | |
| Backups & restore | Permanent data loss | | |
| HTTPS & CORS | Login failures, blocked API calls | | |
| Smoke tests after deploy | Silent regressions | | |

---

## 2. Release engineering and build

- [ ] **Backend:** Dependencies install cleanly on the **same Python version** as production (see `backend/Dockerfile`; avoid mismatched host Python vs image).
- [ ] **Backend:** Application starts with production-like settings (`APP_ENV` or equivalent reflects production, not `dev`/`local`).
- [ ] **Frontend:** `npm run build` succeeds (`docs/BUILD_VERIFICATION.md` B3).
- [ ] **Frontend:** Production bundle points to the **live API** (`VITE_API_BASE_URL` set at **build time** for static/nginx builds).
- [ ] **Frontend:** `VITE_ALLOWED_HOSTS` includes your live hostname(s) so Vite/build tooling and hosting align.
- [ ] **Lint / quality (optional but recommended):** `npm run lint` in `frontend/`; address new errors in touched areas.

---

## 3. Configuration and secrets

- [ ] **JWT:** Strong, unique `JWT_SECRET` in production (never commit real secrets; use server `.env` only).
- [ ] **Database:** `DATABASE_URL` uses production host, credentials, and SSL mode if your provider requires it.
- [ ] **CORS:** `CORS_ORIGINS` lists only your real `https://` frontend origins (comma-separated as configured in your app).
- [ ] **Bootstrap / first user:** For production, first-user registration is **not** open-ended. Configure **either** `BOOTSTRAP_REGISTRATION_KEY` **or** per-tenant `bootstrap_token_hash` as described in `.env.example` and `PRE_PRODUCTION_AUDIT.md` Finding #4.
- [ ] **Redis:** If sessions or cache depend on Redis, `REDIS_URL` is set and Redis is reachable from the API in production.

---

## 4. Database and data integrity

- [ ] **Migrations:** `alembic upgrade head` has been run against a **staging** database that mirrors production scale/settings; no errors.
- [ ] **Duplicate codes (before unique migrations):** If upgrading from an older DB, run duplicate checks for document codes before applying constraints (see `PRE_PRODUCTION_AUDIT.md` Finding #2, Step 1).
- [ ] **Backup:** Automated backups enabled (provider snapshot or `pg_dump` schedule); retention policy defined.
- [ ] **Restore drill:** At least one successful **restore test** to a non-production instance documented (who/when).

---

## 5. Security and multi-tenancy

- [ ] **Header discipline:** Clients always send correct `X-Tenant-Id` matching the logged-in user; `require_tenant` enforces match (see `PRE_PRODUCTION_AUDIT.md` Finding #4).
- [ ] **Role and permission smoke test:** Sample users (admin vs restricted) cannot perform each other’s sensitive actions via UI **and** via direct API calls.
- [ ] **No debug endpoints** or default credentials exposed on the public internet.

---

## 6. Performance and API behavior

- [ ] **List endpoints:** Heavy lists use limits/pagination or caps per `backend/app/common/pagination.py` (`MAX_PAGE_SIZE` and module patterns — see `PRE_PRODUCTION_AUDIT.md` Finding #3).
- [ ] **Staging load (optional):** If you expect large tenants, run a basic load or “large list” test on critical screens (items, orders, finance lists).

---

## 7. Frontend resilience and UX

- [ ] **Error boundary:** App wraps critical tree so render errors do not white-screen the whole product (`AppErrorBoundary` / `ErrorBoundary` — see `PRE_PRODUCTION_AUDIT.md` Finding #5).
- [ ] **Session expiry:** Expired JWT leads to predictable behavior (e.g. redirect to login with reason), not a broken half-logged-in state (`frontend/src/api/client.ts`).
- [ ] **API failures:** Important loads and mutations surface errors or use `logApiError` rather than silent failure (Finding #5).

---

## 8. Infrastructure and hosting

Align with **production architecture** rules:

- [ ] **TLS:** HTTPS terminated at host Nginx (or provider LB) for real users; API and app URLs use `https://` in production config.
- [ ] **Ports:** Do not bind container `80` to host `80` if the host Nginx already serves the site; internal mappings like `5173:80` for the frontend container are the documented pattern.
- [ ] **Compose vs prod:** `docker-compose.yml` in-repo is oriented to **development** (reload, bind mounts). Production should use **immutable images**, no source bind mounts, and a proper process manager or orchestrator.
- [ ] **WebSockets (if used):** Nginx upgrades `wss://` correctly when the app uses secure websockets.

---

## 9. Observability and operations

- [ ] **Logs:** API logs are collected (file, journald, or log platform) with rotation; no passwords or full JWTs logged.
- [ ] **Health check:** Load balancer or orchestrator hits a health route if you expose one; failures alert someone on-call.
- [ ] **Support path:** Users know how to report issues; engineering knows how to access logs and DB **read-only** for triage.

---

## 10. Module and business readiness

- [ ] **Finance (if live):** Criteria in [`FINANCE_GO_LIVE_CRITERIA.md`](./FINANCE_GO_LIVE_CRITERIA.md) satisfied; UAT evidence stored.
- [ ] **Inventory / merch / HR (as applicable):** Business owner sign-off on the workflows you are enabling in v1; training or quick-reference prepared.
- [ ] **Cutover:** If migrating from another system, cutover steps and rollback are written (see finance cutover doc if finance is in scope: `FINANCE_CUTOVER_PLAN.md`).

---

## 11. Public site, SEO, and marketing (if applicable)

- [ ] **Robots / sitemap:** See `docs/SITEMAP_NOTE.md`, `docs/SEO_SEARCH_CONSOLE.md`; production URLs in sitemap match live domain.
- [ ] **Meta / OG:** Default images and titles appropriate for sharing (`frontend/src/components/Seo.tsx`, `frontend/public/images/`).

---

## 12. Ordered pre-deployment runbook (suggested)

1. Freeze risky merges; tag release candidate.  
2. Run full build pipeline (backend tests if you have them, `npm run build`, image build).  
3. Apply migrations on staging → smoke test → apply on production maintenance window if needed.  
4. Deploy API, then frontend static assets or container.  
5. Verify env vars on the **running** processes (not only `.env` on disk).  
6. Run **post-deploy smoke tests** (below).  
7. Monitor error rates and latency for the first hours.

---

## 13. Post-deploy smoke tests (minimum)

Complete these on production (or production-like staging) with a real tenant:

1. Login and tenant selection (company code / header).  
2. Open one **read-heavy** list (e.g. customers or inventory items) and one **write** flow (small create/edit).  
3. If finance is enabled: open CoA or a voucher list; confirm no 500s.  
4. Log out; confirm session cleared; login again.  
5. Optional: force token expiry or revoke session and confirm redirect / messaging.

Record **pass/fail** and **screenshot or ticket** for failures.

---

## 14. Sign-off

| Role | Name | Date | Signature / note |
|------|------|------|------------------|
| Engineering | | | |
| Product / business | | | |
| Security / IT (if any) | | | |

---

## 15. Revision history

| Date | Change |
|------|--------|
| 2026-03-22 | Initial production readiness checklist |

When you close gaps from [`PRE_PRODUCTION_AUDIT.md`](./PRE_PRODUCTION_AUDIT.md), add a short note here or in your release ticket so the two documents stay aligned.
