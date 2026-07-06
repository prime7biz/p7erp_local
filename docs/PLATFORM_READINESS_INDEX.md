# Prime7 Platform Readiness — Program Index

Master index for the Prime7 platform rollout program. Use these docs for execution.

## Phase documents

| Phase | Document |
|-------|----------|
| P0 Baseline | [PLATFORM_PHASE0_BASELINE.md](./PLATFORM_PHASE0_BASELINE.md) |
| Gap register | [PLATFORM_GAP_REGISTER.md](./PLATFORM_GAP_REGISTER.md) |
| P1 UAT | [FINANCE_UAT_TEST_CASES.md](./FINANCE_UAT_TEST_CASES.md), `backend/scripts/run_platform_readiness_suite.py` |
| P2 Compliance | `backend/app/modules/compliance/` (API `/api/v1/compliance/*`) |
| P3 Factory types | [FACTORY_TYPE_WORKFLOWS.md](./FACTORY_TYPE_WORKFLOWS.md) |
| P4 Scale & billing | `POST /api/v1/admin/tenants/bulk`, `scripts/bulk_provision_tenants.py` |
| P5 Bank / financier | [BANK_FINANCIER_SLA.md](./BANK_FINANCIER_SLA.md) |
| P6 Performance | [LOAD_TEST_RUNBOOK.md](./LOAD_TEST_RUNBOOK.md) |
| P7 Security | [SECURITY_AUDIT_CHECKLIST.md](./SECURITY_AUDIT_CHECKLIST.md) |
| P8 Data migration | `POST /api/v1/data-migration/import` |
| P9 Support | [SUPPORT_RUNBOOK.md](./SUPPORT_RUNBOOK.md) |
| P10 Validation wave | [VALIDATION_WAVE_RUNBOOK.md](./VALIDATION_WAVE_RUNBOOK.md) |

## Engineering verification

```powershell
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/run_platform_readiness_suite.py
docker compose exec backend pytest -q
```

## Key env flags

- `PLAN_ENFORCEMENT_ENABLED=true` — enforce subscription user limits (production billing)
- `BOOTSTRAP_REGISTRATION_KEY` — lock public tenant registration
