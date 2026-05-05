# RBAC + Single Session Go-Live Runbook

This runbook is designed to keep live tenants stable during rollout.

## 1) Pre-Deployment

1. Take a DB backup.
2. Deploy code with all flags defaulting to safe behavior:
   - `rbac_enforcement = "off"`
   - `single_session_enforced = false`
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
6. Set `single_session_enforced` to `true` when ready to enforce one-active-login behavior.

## 4) Expand Rollout

Repeat step (3) tenant-by-tenant. Do not mass-enable all tenants at once.

## 5) Rollback

If any tenant is impacted:

1. Set `rbac_enforcement` to `"off"`.
2. Set `single_session_enforced` to `false`.
3. Ask affected users to refresh/login again.

No code rollback is required for this emergency recovery path.
