# Security Audit Checklist

Use before bank pilot and mass platform rollout.

## Tenant isolation

- [ ] Run `pytest tests/test_merch_tenant_isolation.py tests/test_platform_readiness_integration.py -q`
- [ ] External portal JWT cannot access `/api/v1/*` internal routes
- [ ] Internal JWT cannot access other tenant via `X-Tenant-Id` mismatch

## Bootstrap lockdown

- [ ] `BOOTSTRAP_REGISTRATION_KEY` set in production `.env`
- [ ] Public register blocked without key
- [ ] `plan_enforcement_enabled=true` when billing live

## Secrets & CORS

- [ ] Unique `JWT_SECRET` per environment
- [ ] `CORS_ORIGINS` lists only production HTTPS origins
- [ ] No secrets in Git

## External portals

- [ ] Financier scope enforced per principal
- [ ] Document download flag respected
- [ ] External audit log reviewed (`/app/settings/external-access/audit`)

## Penetration test

- [ ] Third-party or internal pen-test completed
- [ ] All High/Critical findings closed or accepted in writing

## Privacy

- [ ] DPA includes Bangladesh addendum (`frontend/src/data/legal/dpa/bangladesh.ts`)
- [ ] Trust center and SLA pages current
