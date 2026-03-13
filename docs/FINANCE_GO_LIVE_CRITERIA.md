# Finance Go-Live Criteria

Purpose: Define simple and measurable conditions before Finance module production go-live.

This document is written for practical business sign-off and beginner-friendly execution.

---

## 1) Scope Included in Go-Live Decision

The go-live decision covers:
- Finance masters (Account Groups, Chart of Accounts)
- Voucher workflow (draft, submit, approve, post, reverse where enabled)
- AP/AR and bill allocation
- Banking (Bank Accounts, Payment Runs, Payment Advice)
- Bank Reconciliation (statement import, matching, finalization lock)
- Accounting Period controls
- Core finance reports and CSV/print output

Reference test assets:
- `docs/FINANCE_UAT_CHECKLIST.md`
- `docs/FINANCE_UAT_TEST_CASES.md`

---

## 2) Mandatory Pass Criteria (Hard Gates)

All items below must be TRUE:

1. **Critical test cases:** 100% PASS  
   - From `FIN-UAT-001` to `FIN-UAT-044`, every case marked `Critical` must be `Pass`.

2. **High severity defects:** 0 open  
   - No unresolved `High` defects related to accounting integrity, workflow, posting, balances, or tenant security.

3. **Data integrity checks:** PASS  
   - Debit/credit balancing is enforced.
   - Posting in closed period is blocked.
   - Payment run execution updates voucher/bank/bill states correctly.
   - Tenant isolation confirmed.

4. **Role security checks:** PASS  
   - Restricted actions (approval/finalization/reopen/etc.) are protected by UI and API.

5. **Reconciliation controls:** PASS  
   - Finalized reconciliation blocks edits.
   - Match/unmatch logs are available.

---

## 3) Target Quality Criteria (Soft Gates)

These are strongly recommended before go-live:

- Overall UAT pass rate >= 95%
- Medium severity defects open <= 3 (with approved workaround)
- Low severity defects open <= 10
- User acceptance demo completed with business owner and finance lead
- Key report exports verified by finance team (sample files checked)

---

## 4) Pre Go-Live Operational Checklist

- [ ] Production tenant/company master data prepared
- [ ] Opening balances validated and approved by finance
- [ ] Active accounting period configured correctly
- [ ] Finance role matrix reviewed (admin/manager/user)
- [ ] Backup and restore drill completed
- [ ] Support contact and escalation channel shared with users
- [ ] Rollback plan approved

---

## 5) Evidence Required for Sign-Off

Collect and store:
- UAT execution sheet with status for each `FIN-UAT-*`
- Defect list with severity and closure notes
- Screenshots or exports for key reports
- Final business confirmation from finance owner

---

## 6) Go-Live Decision Matrix

| Condition | Result |
|---|---|
| All hard gates pass, soft gates acceptable | **GO** |
| Any hard gate fails | **NO-GO** |
| Hard gates pass, but soft gates borderline | **GO with Risk Acceptance** |

For **GO with Risk Acceptance**, business owner must sign written acceptance.

---

## 7) Sign-Off Sheet

### Technical Sign-Off
- Name:
- Role:
- Date:
- Decision: GO / NO-GO / GO with Risk Acceptance
- Notes:

### Finance Business Sign-Off
- Name:
- Role:
- Date:
- Decision: GO / NO-GO / GO with Risk Acceptance
- Notes:

### Project Owner Approval
- Name:
- Role:
- Date:
- Final Decision:
- Approved Go-Live Date:

