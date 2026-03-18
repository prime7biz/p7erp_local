# Backend Scan Report – Bugs & Anomalies

**Date:** 2026-03-18  
**Scope:** Full backend (`backend/app`, `backend/scripts`, `backend/alembic`)  
**Method:** Multi-agent scan (explore + security + logic/error-handling audit)

---

## Executive summary

- **High severity:** 5 items (auth/tenant exposure, unhandled DB exceptions, COA import partial commit, swallowed background-task errors, default secrets).
- **Medium severity:** 6 items (tenant-from-header consistency, password validation, CORS, exception handling, COA/currency HTTP contract).
- **Low severity:** Multiple consistency and defensive improvements.

**Suggested order of work:** Fix high-severity items first (GET /tenants/me auth, scalar_one → HTTP errors, COA import transaction/validation, main.py background-task logging, production secrets). Then standardize tenant checks and password validation.

---

## 1. High-severity findings

### 1.1 GET /tenants/me – no authentication (security)

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/tenant/router.py` (GET /api/v1/tenants/me) | **High** | Uses only `Depends(require_tenant)`. Any client can send `X-Tenant-Id: <id>` and receive that tenant’s name, domain, company_code, tenant_type, is_active. |

**Fix:** Add `user: User = Depends(get_current_user)` and enforce `user.tenant_id == tenant.id` (e.g. existing `_ensure_user_tenant` pattern) so only authenticated users of that tenant can read tenant info.

---

### 1.2 scalar_one() can raise NoResultFound → 500 (bugs)

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/auth/router.py` (~line 137) | **High** | `/me` uses `tenant_result.scalar_one()`. If `user.tenant_id` points to a deleted/inactive tenant, no row → `NoResultFound` → 500. |
| `app/modules/users/router.py` (~line 56) | **High** | `/me` uses `role_result.scalar_one()`. If `current_user.role_id` points to a deleted role, same behavior. |
| `app/modules/settings/router.py` (~line 395) | **High** | After loading target user, `role_result.scalar_one()` for that user’s role can raise if the role was deleted. |

**Fix:** Use `scalar_one_or_none()` and raise explicit `HTTPException` (e.g. 404 or 409) with a clear message when tenant/role is missing, instead of letting SQLAlchemy raise.

---

### 1.3 COA CSV import – partial commit and unhandled ValueError (logic + error handling)

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/finance/router.py` (COA import ~1325–1507) | **High** | (1) No try/except around CSV parsing. `int(r.get("sort_order") or 0)` and `int(r.get("display_order") or 0)` can raise `ValueError` on non-numeric values → 500. (2) Groups are committed (~line 1425), then account rows are processed; if an account fails (~1465) or any exception in the account loop, response can be 200 with `ok: False` or 500 but groups are already committed → partial DB state with no rollback. |

**Fix:** Validate/coerce numeric fields (e.g. try/except or helper like `try_int(s, default=0)`) and collect errors; skip invalid rows or return 4xx with error list. Process/validate all rows (or at least all account rows) before any `commit`; use a single transaction and only commit when the whole import succeeds (or return 4xx and roll back).

---

### 1.4 Background alert scan – exceptions swallowed (error handling)

| Where | Severity | Details |
|-------|----------|---------|
| `app/main.py` (~lines 67–72) | **High** | In `_run_alert_scan_all_tenants()`, inner `except Exception` rolls back and continues; outer `except Exception: pass` swallows all errors (e.g. from `get_tenant_ids` or DB). The background task never fails visibly. |

**Fix:** At least log the exception in the outer handler (e.g. `logging.exception(...)`). Consider re-raising or reporting so DB/configuration failures are visible.

---

### 1.5 Default secrets in production (security)

| Where | Severity | Details |
|-------|----------|---------|
| `app/config.py` (jwt_secret, ai_confirmation_token_pepper) | **High** | `jwt_secret: str = "change-me-in-production"` and `ai_confirmation_token_pepper: str = "change-me-ai-token-pepper"`. If production runs with these, tokens are weak. |

**Fix:** Ensure production sets `JWT_SECRET` and AI token pepper from env. Optionally fail startup or refuse sensitive operations if still default in prod.

---

## 2. Medium-severity findings

### 2.1 Tenant resolved only from header (design risk)

| Where | Severity | Details |
|-------|----------|---------|
| `app/common/tenant.py` + routers | **Medium** | `require_tenant` resolves tenant only from `X-Tenant-Id`. JWT does not carry tenant; backend does not bind header to the authenticated user. Many routers already do `_ensure_user_tenant` / `user.tenant_id != tenant.id`; ensure this is consistent everywhere that uses `require_tenant`. |

**Fix:** Use a single dependency that, after `get_current_user` and `require_tenant`, checks `user.tenant_id == tenant.id` on every tenant-scoped route; or resolve tenant from the token (e.g. include `tenant_id` in JWT).

---

### 2.2 Inconsistent tenant-check pattern

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/inquiries/router.py`, `app/modules/reports/router.py` | **Medium** | Repeated inline `if user.tenant_id != tenant.id: raise ...`. Other modules use a shared helper. Logic duplicated. |

**Fix:** Introduce a shared helper (e.g. in `app/common/auth.py` or tenant module) and use it in inquiries and reports.

---

### 2.3 Password strength not enforced

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/auth/schemas.py` (RegisterRequest) | **Medium** | `password: str` has no `min_length`, `max_length`, or pattern. Weak passwords allowed. |

**Fix:** Add `Field(..., min_length=8, max_length=128)` and optionally a regex or custom validator for complexity.

---

### 2.4 CORS with credentials

| Where | Severity | Details |
|-------|----------|---------|
| `app/main.py` (CORS config) | **Medium** | `allow_credentials=True` with `allow_origins=origins`. If `CORS_ORIGINS` ever includes `"*"`, browsers may reject credentials. |

**Fix:** In production, set explicit `CORS_ORIGINS` (no `*`). Reject or strip `*` when `allow_credentials=True`. Document that empty value means localhost-only.

---

### 2.5 Currency fetch failure returns 200

| Where | Severity | Details |
|-------|----------|---------|
| `app/modules/currency/router.py` (~298–309) | **Medium** | On fetch failure, endpoint returns **200** with `"error": str(e)` and `live: False`. Clients that only check status code may treat failure as success. |

**Fix:** Return 502/503 for hard failures, or 200 with a clear `success: false` and document that clients must check `live` or `error`.

---

### 2.6 HR UAT script – swallowed exception

| Where | Severity | Details |
|-------|----------|---------|
| `scripts/verify_hr_uat_extended_api.py` (~266–269) | **Medium** | `except Exception: pass` when parsing `used_days` from leave balance. Invalid/missing value is silently ignored; test can pass/fail for the wrong reason. |

**Fix:** Log and/or set a sentinel (e.g. `after_used = None`) and treat as failure or skip so the test result is explicit.

---

## 3. Low-severity findings

| ID | Where | Issue | Fix |
|----|--------|--------|-----|
| L1 | `app/modules/commercial/router.py` (~500, 581) | After create/update, `scalar_one()` could raise in edge cases. | Use `scalar_one_or_none()` and handle `None` with 404/500 and log. |
| L2 | `app/modules/tna_unified/router.py`, dashboard, settings, hr_ess, merch/alert_engine | `.all()` vs `.scalars().all()` – different shapes (Row vs entity). | Standardize: `.scalars().all()` for single-entity selects; document or comment intended shape. |
| L3 | `app/modules/audit/router.py` | Missing type on `tenant=Depends(require_tenant)`; duplicate import of `HTTPException`/`status` inside handler. | Add `tenant: Tenant`; remove inner import. |
| L4 | Various routers | Two helper names for same check: `_ensure_tenant` vs `_ensure_user_tenant`. | Prefer one name or move to a single shared helper in common. |
| L5 | `app/modules/auth/router.py` (~24) | `except Exception` for `request.json()` – very broad. | Catch `RequestValidationError` or more specific exception if possible. |
| L6 | `app/modules/currency/router.py` (~301–302) | Broad `except Exception` when fetching live rates. | Catch specific exceptions (e.g. timeout, connection errors) and log; keep one broad fallback. |
| L7 | `app/modules/merch/alert_engine.py` (~178–180) | `datetime.utcnow()` deprecated; exception path should log/re-raise. | Use `datetime.now(timezone.utc)`; ensure exception is logged or re-raised after updating state. |
| L8 | Various | Status codes as integers (403, 400) vs `status.HTTP_*`. | Use `status.HTTP_*` everywhere for consistency. |
| L9 | `app/modules/finance/router.py` (~4785–4789) | When `ranking` is empty, `[0]` sentinel used for `User.id.in_([0])` – misleading. | Only run User query when `user_ids` is non-empty; return empty list when `ranking` is empty. |
| L10 | `app/modules/merch/alert_rules.py` (~127) | `ref_date` from `created_at.date()` – server-local date vs UTC. | Use UTC for “today” and for deriving date from `created_at`; or document server-local. |
| L11 | `app/models/manufacturing.py` | `default=datetime.utcnow` deprecated (naive UTC). | Use timezone-aware defaults (e.g. `datetime.now(timezone.utc)`). |
| L12 | Various (merch, finance, inquiries) | Search uses `%`/`_` in LIKE patterns – user can broaden matches. | Escape `%` and `_` in search strings, or document/limit length. |
| L13 | COA import / currency | 200 with `ok: False` or `live: False` – no HTTP distinction for failure. | Document that clients must check `ok`/`live`; or use 400/409 and 5xx where appropriate. |

---

## 4. Positive findings (no change needed)

- **Database session:** `get_db()` commits on success, rolls back on exception, re-raises. Session lifecycle correct.
- **Division by zero:** Wastage, variance, pass_rate, cost_per_piece all guard with `expected > 0` (or equivalent) before dividing.
- **Workflow:** Inquiry, quotation, order, BOM transitions centralized in `workflow.py`; invalid transitions raise 400.
- **SQL injection:** Queries use SQLAlchemy ORM and bound parameters; no raw string interpolation in queries.
- **Path traversal:** File uploads use `uuid4().hex` and fixed prefixes; filenames not from user input.
- **JWT:** Uses `algorithms=[...]`; no algorithm confusion. Token payload has `sub` and `exp`.
- **Protected routes:** Consistently use `require_tenant` and `get_current_user` on intended protected endpoints (except GET /tenants/me as above).
- **Background task session (merch):** `_run_scan_background` creates its own session, commits on success, rolls back on exception.

---

## 5. Summary table

| Severity | Count | Categories |
|----------|-------|------------|
| High    | 5     | Auth/tenant exposure, scalar_one → 500, COA import partial commit + ValueError, background-task swallow, default secrets |
| Medium  | 6     | Tenant-from-header, duplicate tenant check, password validation, CORS, currency 200 on failure, HR script except |
| Low     | 13    | Defensive scalar_one, Result API consistency, types/imports/naming, exception/datetime/status codes, ranking sentinel, LIKE escape, HTTP contract |

---

## 6. Recommended fix order

1. **GET /tenants/me:** Add `get_current_user` and `user.tenant_id == tenant.id` check.
2. **Auth/users/settings:** Replace `scalar_one()` with `scalar_one_or_none()` and explicit HTTPException for missing tenant/role.
3. **COA import:** Single transaction; validate/coerce all CSV numerics before any commit; return 4xx on validation/conflict with errors.
4. **main.py:** Log (and optionally re-raise or report) exceptions in `_run_alert_scan_all_tenants` outer handler.
5. **Production secrets:** Require non-default `JWT_SECRET` and AI token pepper in production (env + optional startup check).
6. **Tenant checks:** Single shared helper and use it in inquiries and reports; consider dependency that enforces `user.tenant_id == tenant.id`.
7. **Password strength:** Min length (and optionally complexity) on RegisterRequest.
8. **CORS:** Document and enforce no `*` with credentials; explicit production origins.
9. **Currency:** 5xx or documented contract for fetch failure.
10. Remaining low-severity items as incremental cleanup.
