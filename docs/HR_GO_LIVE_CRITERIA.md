# HR Go-Live Criteria

Purpose: Define clear and measurable conditions before HR module production go-live.

---

## 1) Scope in Decision

Go-live decision covers:
- Core HR masters and employee profiles
- Attendance and regularization workflows
- Leave and leave approval workflows
- Payroll setup, runs, approvals, posting, payslips
- Performance, recruitment, and ESS baseline flows
- HR reports and dashboard exports

Reference assets:
- `docs/HR_UAT_CHECKLIST.md`
- `docs/HR_UAT_TEST_CASES.md`
- `docs/HR_PARITY_GAP_TRACKER.md`

---

## 2) Mandatory Hard Gates

All items must be true:

1. Critical HR-UAT cases: 100% Pass  
2. Open Critical defects: 0  
3. Open High defects: 0  
4. Tenant isolation checks: Pass  
5. Role protection checks: Pass  
6. Payroll posting reconciliation with Finance: Pass  
7. Closed period protection for payroll posting: Pass

---

## 3) Soft Quality Gates

Recommended before go-live:
- Overall UAT pass rate >= 95%
- Medium defects open <= 5 with approved workaround
- ESS usage pilot completed with selected users
- HR reports (CSV/print) validated by business users

---

## 4) Go/No-Go Matrix

| Condition | Decision |
|---|---|
| All hard gates pass | GO |
| Any hard gate fails | NO-GO |
| Hard gates pass, soft gates borderline | GO with Risk Acceptance |

GO with Risk Acceptance requires written approval from business owner.

---

## 5) Sign-Off Sheet

### Technical Sign-Off
- Name:
- Role:
- Date:
- Decision: GO / NO-GO / GO with Risk Acceptance
- Notes:

### HR Business Sign-Off
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

