# Finance Cutover Plan

Purpose: Provide a clear step-by-step runbook for moving Finance module from UAT to production safely.

This plan is beginner-friendly and can be followed by technical + finance users together.

---

## 1) Cutover Roles

Assign owners before starting:

- Cutover Lead (overall coordination)
- Technical Lead (deployment, DB, backup/restore)
- Finance Lead (opening balances, data validation, sign-off)
- UAT Coordinator (test evidence collection)
- Support Owner (hypercare and issue triage)

---

## 2) Timeline Overview

- **T-7 to T-5 days:** Freeze scope and finish UAT closure
- **T-4 to T-2 days:** Dry run and data readiness
- **T-1 day:** Final backup + release readiness check
- **T day (Go-Live):** Deploy, migrate, validate, open system
- **T+1 to T+3 days:** Hypercare monitoring and stabilization

---

## 3) T-7 to T-5: Scope Freeze and UAT Closure

- [ ] Freeze finance feature scope (no new features, only critical fixes).
- [ ] Review `docs/FINANCE_UAT_TEST_CASES.md` results.
- [ ] Ensure all **Critical** cases are pass.
- [ ] Confirm `docs/FINANCE_GO_LIVE_CRITERIA.md` hard gates are met.
- [ ] Create final defect list with owner + target closure date.

Output:
- UAT closure note approved by Finance Lead and Technical Lead.

---

## 4) T-4 to T-2: Dry Run and Data Preparation

### 4.1 Dry Run (Staging)
- [ ] Execute full deployment in staging.
- [ ] Run DB migration in staging.
- [ ] Run smoke tests:
  - Login
  - Voucher create/post
  - Payment run execute
  - Reconciliation finalize lock
  - Day Book and Trial Balance report load/export

### 4.2 Data Readiness
- [ ] Finalize chart of accounts in production template.
- [ ] Prepare opening balances file with finance owner approval.
- [ ] Validate suppliers/customers/bank accounts are complete.
- [ ] Validate accounting period setup for go-live month.

Output:
- Signed dry-run checklist and approved opening balance file.

---

## 5) T-1 Day: Final Readiness Gate

- [ ] Confirm no open Critical/High defects for finance scope.
- [ ] Lock release branch/tag for production deployment.
- [ ] Take full production backup (database + app config files).
- [ ] Verify restore test from latest backup (sample restore).
- [ ] Share go-live communication to users (planned downtime window).
- [ ] Prepare support room/channel for go-live day.

Output:
- Go/No-Go meeting decision recorded.

---

## 6) T Day: Go-Live Runbook

### 6.1 Pre-Deployment
- [ ] Announce maintenance mode start.
- [ ] Restrict user write access during cutover window.
- [ ] Take final pre-deploy backup snapshot.

### 6.2 Deployment
- [ ] Deploy approved backend/frontend release artifact.
- [ ] Apply DB migrations to production.
- [ ] Verify application starts cleanly.

### 6.3 Finance Data Activation
- [ ] Load/validate opening balances.
- [ ] Validate accounting period open/close states.
- [ ] Validate finance role permissions (admin/manager/user).

### 6.4 Post-Deployment Smoke Test (Must Pass)
- [ ] Login and open Finance menu.
- [ ] Create and post one test voucher.
- [ ] Create and execute one test payment run.
- [ ] Create one reconciliation and verify statement import.
- [ ] Open reports: Day Book, Trial Balance, Financial Statements.
- [ ] Verify print and CSV export buttons.

### 6.5 Business Release
- [ ] Finance Lead confirms results.
- [ ] Announce system open to business users.

---

## 7) Rollback Plan (If Needed)

Trigger rollback when:
- Critical accounting integrity issue found (posting wrong amounts, broken balancing, tenant leakage)
- Deployment instability blocks finance operations

Rollback steps:
1. Stop user transactions immediately.
2. Revert app to previous stable release.
3. Restore DB from final pre-deploy backup.
4. Validate previous release smoke tests.
5. Announce rollback complete and business advisory.
6. Open incident RCA and corrective action plan.

Note:
- Do not perform partial manual data edits during rollback decision window.

---

## 8) T+1 to T+3: Hypercare

Daily checks (minimum 2 times/day):
- [ ] Voucher posting count vs expected
- [ ] Payment run execution logs
- [ ] Reconciliation activities
- [ ] Report export issues
- [ ] Error logs and API failures
- [ ] User access/role complaints

Daily hypercare review meeting:
- Open issues
- Workaround status
- ETA for fixes
- Risk for next business day

Exit criteria for hypercare:
- No open Critical issues for 48 hours
- No unresolved High issue blocking finance users

---

## 9) Communication Templates

### 9.1 Pre-Go-Live Notice
Subject: Finance Module Go-Live Window  
Message: Finance module will be in maintenance from [time] to [time] on [date]. Please avoid posting transactions during this period.

### 9.2 Go-Live Success Notice
Subject: Finance Module Live  
Message: Finance module is now live as of [time]. If you face issues, contact [support channel].

### 9.3 Rollback Notice
Subject: Finance Module Rollback Advisory  
Message: Due to critical validation findings, we rolled back to the previous stable version. Further update will be shared by [time].

---

## 10) Final Sign-Off

- Cutover Lead:
- Technical Lead:
- Finance Lead:
- Date:
- Final Outcome: GO / ROLLBACK / GO with Hypercare Extension

