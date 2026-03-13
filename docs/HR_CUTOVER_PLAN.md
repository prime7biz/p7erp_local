# HR Cutover Plan

Purpose: Execute controlled HR module production cutover with rollback readiness.

---

## 1) Pre-Cutover Checklist (T-7 to T-1)

- [ ] Final migration list reviewed and approved
- [ ] Backup and restore drill completed
- [ ] Production config validated
- [ ] Roles and access matrix approved
- [ ] UAT closure evidence collected
- [ ] Rollback owner assigned

---

## 2) Cutover Day Runbook (T0)

1. Freeze HR transactional updates in old process/tools
2. Take database backup snapshot
3. Deploy backend + frontend release
4. Run migrations (`022` to `033`)
5. Seed required reference data (if needed)
6. Execute smoke tests:
   - HR login/menu
   - Employee list/detail update
   - Attendance entry
   - Leave request/approval
   - Payroll run creation
7. Open system to pilot users

---

## 3) Hypercare (T+1 to T+3)

- Monitor error logs and failed API calls
- Track high-priority defects with same-day triage
- Daily business check-in with HR lead
- Reconcile payroll posting sample with Finance

---

## 4) Rollback Plan

Rollback triggers:
- Critical data integrity issue
- Cross-tenant data exposure
- Payroll posting mismatch

Rollback steps:
1. Disable user access
2. Restore backup snapshot
3. Revert application release
4. Validate smoke checks on previous stable version
5. Publish incident and next attempt date

