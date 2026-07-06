# Support Runbook

## Channels

| Channel | Path | Audience |
|---------|------|----------|
| In-app tickets | `/app/support/tickets` | Tenant users |
| Platform admin | `/api/v1/admin/support` | Super admin |
| Email | Configure `SMTP_*` in production `.env` | Invites, password reset |

## SLA targets

| Priority | First response | Resolution target |
|----------|----------------|-------------------|
| Critical (posting down) | 4 hours | 24 hours |
| High (workflow blocked) | 8 hours | 3 business days |
| Medium | 1 business day | 5 business days |
| Low | 2 business days | Best effort |

## Onboarding checklist (per customer factory)

1. Platform admin creates tenant (`POST /api/v1/admin/tenants` or bulk)
2. Run `seed_new_tenant_minimum.py --company-code <CODE>`
3. Assign subscription plan
4. Train admin on Help & Tutorials (`/app/tutorials`)
5. Data migration dry-run via `POST /api/v1/data-migration/import?dry_run=true`

## Reseller / partner network

- Partners handle L1 support (login, navigation, training)
- Prime7 handles L2 (bugs, migrations, finance posting)
- Platform operator handles subscription billing to customer factories

## Escalation

Critical finance posting → tag `finance` + notify engineering on-call.
