# RBAC + Single Session Go-Live Runbook

This runbook is designed to keep live tenants stable during rollout.

## Single session (one user, one device) — global default

Single-session login is **on for every tenant by default** via the backend setting
`single_session_global` (env `SINGLE_SESSION_GLOBAL`, default `true` in `backend/app/config.py`).

- A staff user can be logged in on only one device/browser at a time.
- A new login invalidates the previous device's token; that device gets
  `401 {"code": "session_superseded"}` on its next request and is redirected to
  `/login?reason=session_replaced`.
- Tokens issued before enforcement (no `sv` claim) stay valid until they expire, so
  enabling it does not log everyone out at once.
- When `SINGLE_SESSION_GLOBAL=false`, the per-tenant flag `single_session_enforced`
  decides (off unless set to `true` on the tenant).

## 1) Pre-Deployment

1. Take a DB backup.
2. Deploy code with RBAC defaulting to safe behavior:
   - `rbac_enforcement = "off"`
3. Run migration:
   - `docker compose exec backend alembic upgrade head`

## 2) Seed Permissions (Before Any Enforce)

Run once to fill empty non-admin role permissions:

- all tenants:
  - `docker compose exec backend python scripts/seed_default_role_permissions.py`
- single tenant:
  - `docker compose exec backend python scripts/seed_default_role_permissions.py --company-code <COMPANY_CODE>`

This script is idempotent and skips roles that already have permissions.

## 3) Pilot Tenant Rollout

For one internal pilot tenant:

1. Set `rbac_enforcement` to `"shadow"`.
2. Keep it in shadow for 24-48 hours.
3. Monitor backend logs for `rbac_shadow_denial`.
4. Adjust role permissions in Settings -> Roles.
5. Set `rbac_enforcement` to `"enforce"` after denials are clean.
6. Single session is already enforced globally (see above). Only if `SINGLE_SESSION_GLOBAL=false`,
   set the tenant's `single_session_enforced` to `true` to enforce one-active-login for that tenant.

## 4) Expand Rollout

Repeat step (3) tenant-by-tenant. Do not mass-enable all tenants at once.

## 5) Rollback

If any tenant is impacted:

1. Set `rbac_enforcement` to `"off"`.
2. To turn off single session for **all** tenants: set `SINGLE_SESSION_GLOBAL=false` in the
   server `.env` and restart the backend (`docker compose -f docker-compose.prod.yml up -d backend`).
   Also make sure the tenant's `single_session_enforced` flag is `false`.
3. Ask affected users to refresh/login again.

No code rollback is required for this emergency recovery path.
