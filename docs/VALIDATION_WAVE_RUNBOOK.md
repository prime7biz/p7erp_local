# Validation Wave & Mass Cutover

Final proof before distributing to all platform tenants.

## Validation wave (5–8 factories + 1 bank)

| # | Type | Duration | Sign-off |
|---|------|----------|----------|
| 1 | Knitwear manufacturer | 4–8 weeks live | Operations lead |
| 2 | Sweater manufacturer | 4–8 weeks | Operations lead |
| 3 | Denim manufacturer | 4–8 weeks | Operations lead |
| 4 | Woven shirt | 4–8 weeks | Operations lead |
| 5 | Bottoms | 4–8 weeks | Operations lead |
| 6 | Buying house | 4–8 weeks | Commercial lead |
| 7 | Both-type company | 4–8 weeks | GM |
| 8 | Bank + 2–3 loan clients | 4–8 weeks | Bank IT + credit |

## Weekly validation meetings

- Review open defects from UAT sheets
- Confirm finance month-end reconciliation
- Collect written reference letters

## Mass cutover (after wave passes)

Follow `docs/GO_LIVE_CUTOVER_RUNBOOK.md` in batches:

| Batch | Size | Pause |
|-------|------|-------|
| 1 | 50 tenants | 1 week monitor |
| 2 | 200 tenants | 1 week monitor |
| 3 | 500 tenants | 2 weeks monitor |
| 4 | Remaining | ongoing |

## Bulk provisioning

```powershell
docker compose exec backend python scripts/bulk_provision_tenants.py --csv scripts/bulk_tenants_sample.csv --plan-id 1
```

Or platform admin API: `POST /api/v1/admin/tenants/bulk`

## Rollback

- Suspend tenant: `POST /api/v1/admin/tenants/{id}/suspend`
- Revert images per `GO_LIVE_CUTOVER_RUNBOOK.md`
