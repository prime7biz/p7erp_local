# Remediation stage 2 — platform security hardening

Date: 2026-11-06. Branch `fix/security-round2` (local + pushed branch only, **not deployed**).
Exploit-level detail stays in the private, git-ignored folder. This page lists what changed, what
operators must do before deploying, and how to roll back.

## 1. Before you deploy (operator checklist)

1. **Back up the production database** (four new Alembic revisions: 251–254, all additive).
2. **Secrets:** outside development the API now refuses to start when `JWT_SECRET` or
   `AI_CONFIRMATION_TOKEN_PEPPER` is empty, a known placeholder, or shorter than 32 characters.
   Check the server `.env` first (`awk -F= '/^JWT_SECRET=/{print length($2)}' .env`). Changing
   `JWT_SECRET` signs everyone out once. Emergency only: `SECRET_MIN_LENGTH=16`.
3. **AI and HR roles:** non-manager roles that relied on the general AI permission now need explicit
   keys (Settings → Roles → AI / HR): `ai.tools.finance.read`, `ai.tools.hr.read`,
   `hr.ai.insights.view`, `ai.finance_forecast`, and `hr.payroll.manage` for payroll anomalies.
   Manager-type roles (admin, manager, owner) are unaffected.
4. **Single session:** with single-session on (default), access tokens without a session-version claim
   are refused. All current logins already carry it; anyone still holding an older token signs in
   again once. Optional grace: `LEGACY_TOKEN_WITHOUT_SV_GRACE_UNTIL=<UTC ISO date>`.
5. **Optional infra** (`docker-compose.prod.yml`, defaults keep today's behaviour except Watchtower):
   `BACKEND_BIND_ADDR=127.0.0.1` when host Nginx proxies to port 8000 locally; pin
   `OLLAMA_IMAGE_TAG`; Watchtower now only updates containers labelled for it
   (`WATCHTOWER_LABEL_ENABLE=false` restores the old behaviour).

## 2. What changed

| Area | Change | Default / flag |
|---|---|---|
| API rate limit | Tenant budget keyed on the tenant inside the signed token (new `tid` claim); requests without a valid token use a separate per-IP budget | `ANON_RATE_LIMIT_REQUESTS_PER_MINUTE=300` |
| Staff invitations | Tokens are `selector.verifier`; accept looks up one row by selector. Older invitations still work until they expire (bounded scan). Accept endpoint rate limited | migration 251 |
| Company sign-up | Per-IP limit; sign-up returns a one-time bootstrap token that the sign-up page uses to register the first admin. Can be closed to key/platform-admin only | `PUBLIC_TENANT_SIGNUP_ENABLED=true`, `TENANT_SIGNUP_RATE_LIMIT_PER_HOUR=10` |
| Impersonation | Token carries the platform admin and a session id; checked on every request; can be ended early (`POST /admin/tenants/{t}/users/{u}/impersonation/revoke`); audit entries show the impersonating admin | — |
| Platform admin 2FA | Optional TOTP (authenticator app) with enrol / enable / disable endpoints, login code, replay protection, super-admin reset; admin console page **Security → Two-factor auth** | `PLATFORM_ADMIN_MFA_REQUIRED=false`, migration 252 |
| Billing webhooks | Tenant taken only from a server-side checkout record or the stored subscription; store id and plan variant verified; empty order status is not "paid"; subscription updated / cancelled / payment-failed events update status; cancelled plans stay usable until the paid period ends | migration 253 |
| AI permissions | Finance / HR / payroll AI keys fail closed (manager bypass); HR AI endpoints and finance forecast use fail-closed checks; keys listed in Settings → Roles | — |
| AI retrieval | Vector and full-text search filter chunks by permission/visibility stored at indexing time (older rows derive it from their module); no user ⇒ no results | migration 254 |
| Files | Signature images only for their owner or manager roles; HR documents need `hr.documents.view` / `hr.access` or a manager role; module key checks for other folders | — |
| Suspended companies | Users of an inactive or deleted tenant are refused on every authenticated route | — |
| Module RBAC (SEC-01/02) | Previously unguarded routers now carry their module key (no effect while a tenant's RBAC mode is off); a route-inventory test keeps it that way; Roles page shows the current mode; operators can set a platform default | `RBAC_DEFAULT_MODE=off` |
| Fine-grained keys (SEC-05) | Per-tenant flag makes `finance.*` / `hr.*` keys need an explicit grant | tenant flag `strict_sensitive_permissions` (off) |
| Passwords / lockout | New or changed passwords ≥ 8 characters; failed logins block the guessing IP for that account, the whole account only after many failures across IPs | `STAFF_LOGIN_ACCOUNT_LOCK_THRESHOLD=40` |
| Errors / exports / IPs | Unexpected errors return a generic message (details in logs); tenant export omits password hashes and other secret columns; audit/admin logs record the real client IP behind proxies | — |
| Paid LLM | Provider requires the caller's tenant id | — |

## 3. Deferred (with reason)

- **Backend image as non-root:** the existing `backend_media` volume holds root-owned files, so a
  non-root process could not write uploads or the Celery beat schedule. Needs a one-off
  `chown -R 10001:10001` of the volume plus `USER` in the Dockerfile, done together in a maintenance window.
- **CI gate before image push (OPS-03 part 2):** changes the release checklist that polls the
  current workflow names; propose `needs:` on the test job in a separate change.
- **Row-level security / composite tenant keys (SEC-04):** architectural (session tenant variable with
  PgBouncer transaction pooling). Tracked in TARGET_ARCHITECTURE §5.
- **HR-02 remainder (device adapter, OT/proration):** functional work (HR-03 / HR-06), not security.
- **External portal lockout** keeps the per-account lock; apply the same per-IP model next.

## 4. Rollback

- Code: `git revert` the stage-2 commits (each area is a separate commit).
- Database: `alembic downgrade 250` (drops the new columns/table; new-style invitation links and
  2FA enrolments are lost, older behaviour returns).
- Flags: `RBAC_DEFAULT_MODE=off`, `PUBLIC_TENANT_SIGNUP_ENABLED=true`, `PLATFORM_ADMIN_MFA_REQUIRED=false`,
  `WATCHTOWER_LABEL_ENABLE=false`, `LEGACY_TOKEN_WITHOUT_SV_GRACE_UNTIL=<future date>`.

## 5. Tests

New: `test_security_round2_auth.py`, `test_security_round2_invites_signup.py`,
`test_security_round2_admin.py`, `test_files_download_access.py`, `test_route_permission_inventory.py`,
`test_ai_permissions_fail_closed.py`, `test_ai_retrieval_permissions.py`, `test_paid_llm_tenant_required.py`,
`test_lemonsqueezy_tenant_binding.py`, `test_generic_error_messages.py`, `test_tenant_export_excludes_secrets.py`.
