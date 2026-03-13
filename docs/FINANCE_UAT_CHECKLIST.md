# Finance Module UAT Checklist (Legacy Parity)

Purpose: Verify P7 Finance behaves like PrimeX legacy for workflow, calculations, and report outputs.

Use this checklist during UAT and mark each test as:
- PASS
- FAIL (with screenshot + error note)
- BLOCKED (with reason)

---

## 1) Test Setup (Run First)

- [ ] Login works with `company_code` + username/email + password.
- [ ] Test tenant has Finance menu visible in sidebar.
- [ ] At least 2 users exist:
  - User A: `admin` or `manager`
  - User B: normal finance user
- [ ] Master data exists:
  - Account Groups
  - Chart of Accounts
  - At least one Supplier and one Customer
  - At least one Bank Account linked to GL
- [ ] Open accounting period exists for current month.

---

## 2) Core Masters

### 2.1 Account Groups
- [ ] Create account group.
- [ ] Edit account group.
- [ ] Delete account group (only when safe/no dependency).
- [ ] List shows new/updated values correctly.

### 2.2 Chart of Accounts
- [ ] Create ledger under a group.
- [ ] Unique account number validation works.
- [ ] Edit ledger details.
- [ ] Active/inactive status works in lists.

---

## 3) Voucher Workflow

### 3.1 Voucher Creation
- [ ] Create voucher with balanced lines (debit = credit).
- [ ] Save as draft.
- [ ] Reject unbalanced voucher with clear message.

### 3.2 Approval and Posting
- [ ] Submit draft voucher.
- [ ] Approve voucher (manager/admin).
- [ ] Post approved voucher.
- [ ] Cancel posting (if enabled by workflow).
- [ ] Reverse posted voucher creates correct opposite impact.

### 3.3 Available Actions / Rules
- [ ] `available-actions` buttons show correctly by status.
- [ ] Unauthorized user cannot perform restricted action.
- [ ] Voucher status transitions match expected lifecycle.

---

## 4) AP/AR and Bills

### 4.1 Outstanding Bills
- [ ] Create payable/receivable bill.
- [ ] Aging buckets show correct overdue classification.
- [ ] Allocate payment to bill reduces outstanding amount correctly.

### 4.2 Purchase to AP Integration
- [ ] Create AP bill from approved PO (if flow enabled).
- [ ] Create AP bill from received GRN.
- [ ] Duplicate AP bill creation is blocked where needed.

---

## 5) Banking and Reconciliation

### 5.1 Bank Accounts
- [ ] Create bank account with GL mapping.
- [ ] Edit bank account details.
- [ ] Bank account list reflects changes.

### 5.2 Payment Runs
- [ ] Create payment run with items.
- [ ] Approve payment run.
- [ ] Process payment run.
- [ ] Execute payment run:
  - Generates linked voucher
  - Updates bank balance correctly
  - Updates bill/payment statuses correctly

### 5.3 Bank Reconciliation
- [ ] Create reconciliation for bank + period.
- [ ] Add manual statement line.
- [ ] Import statement lines by CSV.
- [ ] Auto-match links payment runs correctly.
- [ ] Manual match/unmatch works.
- [ ] Match logs are recorded.
- [ ] Finalize reconciliation (manager/admin only).
- [ ] Finalized reconciliation blocks further edits.

---

## 6) Accounting Period Control

- [ ] Create accounting period.
- [ ] Close period.
- [ ] Posting in closed period is blocked.
- [ ] Reopen period (authorized user).
- [ ] Delete period only when allowed by rules.

---

## 7) Reports and Exports

For each report page below:
- [ ] Data loads without error
- [ ] Filters work
- [ ] Print button opens browser print dialog
- [ ] Export CSV downloads file
- [ ] CSV values match on-screen values

Report pages:
- [ ] Day Book
- [ ] Trial Balance
- [ ] Financial Statements
- [ ] Group Summary
- [ ] Ratio Analysis
- [ ] Cash Flow Report
- [ ] AR/AP Aging
- [ ] Ledger Activity
- [ ] Voucher Analytics

---

## 8) Multi-Currency / FX (If Enabled)

- [ ] FX receipt creation works.
- [ ] Currency conversion values are saved correctly.
- [ ] Revaluation effect appears correctly in finance outputs.

---

## 9) Security and Role Checks

- [ ] Tenant isolation: Tenant A cannot see Tenant B finance data.
- [ ] Manager/admin-only actions are protected by API and UI.
- [ ] Audit-friendly fields (created_by, timestamps, logs) appear where expected.

---

## 10) Defect Log Template

Use this simple format for each failed case:

- Test ID:
- Module/Page:
- Steps to Reproduce:
- Expected Result:
- Actual Result:
- Severity: Critical / High / Medium / Low
- Screenshot/Attachment:
- Assigned To:
- Status:

---

## Suggested Execution Order for Team

1. Masters -> 2. Vouchers -> 3. AP/AR -> 4. Banking -> 5. Reconciliation -> 6. Reports -> 7. Roles/Tenant isolation

This order reduces blockers and makes debugging easier for a beginner team.
