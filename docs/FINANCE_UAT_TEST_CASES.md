# Finance UAT Test Cases (ID-Based)

This document expands the checklist into executable test cases with IDs.

Status values:
- Not Run
- Pass
- Fail
- Blocked

Severity values:
- Critical
- High
- Medium
- Low

---

## Test Case Table

| Test ID | Module | Scenario | Preconditions | Steps | Expected Result | Severity | Status |
|---|---|---|---|---|---|---|---|
| FIN-UAT-001 | Auth | Finance user login with company code | User exists and tenant active | 1) Open login 2) Enter company code, username/email, password 3) Submit | Login succeeds and Finance menus appear per role | Critical | Not Run |
| FIN-UAT-002 | Masters | Create Account Group | Logged in as finance admin | 1) Open Account Groups 2) Add new group 3) Save | Group created and appears in list | High | Not Run |
| FIN-UAT-003 | Masters | Edit Account Group | Existing group present | 1) Edit group title/details 2) Save | Updated values shown in list and reload persists | Medium | Not Run |
| FIN-UAT-004 | Masters | Create Chart of Account | At least one group exists | 1) Open COA 2) Add account number/name/group/nature 3) Save | Ledger account created and selectable in vouchers | High | Not Run |
| FIN-UAT-005 | Masters | Duplicate account number validation | Existing account number present | 1) Create new account with same number 2) Save | API/UI blocks save with clear error | High | Not Run |
| FIN-UAT-006 | Voucher | Create balanced voucher draft | COA has debit and credit ledgers | 1) Open Vouchers 2) Add lines with equal debit/credit 3) Save draft | Draft voucher saved with correct totals | Critical | Not Run |
| FIN-UAT-007 | Voucher | Unbalanced voucher rejection | COA exists | 1) Create voucher with unequal debit/credit 2) Save | Save rejected with validation message | Critical | Not Run |
| FIN-UAT-008 | Voucher | Submit voucher | Draft voucher exists | 1) Open draft voucher 2) Submit | Status changes to submitted/pending approval | High | Not Run |
| FIN-UAT-009 | Voucher | Approve voucher by authorized role | Submitted voucher exists; manager/admin user | 1) Open approvals 2) Approve voucher | Voucher moves to approved state | Critical | Not Run |
| FIN-UAT-010 | Voucher | Approve blocked for unauthorized role | Submitted voucher exists; normal user | 1) Try approval action | Action hidden or API returns forbidden | Critical | Not Run |
| FIN-UAT-011 | Voucher | Post approved voucher | Approved voucher exists and period open | 1) Click post action | Voucher status becomes posted and ledger impact applied | Critical | Not Run |
| FIN-UAT-012 | Voucher | Post blocked in closed period | Period closed for voucher date | 1) Attempt posting | Posting blocked with period-closed message | Critical | Not Run |
| FIN-UAT-013 | Voucher | Reverse posted voucher | Posted voucher exists | 1) Use reverse action 2) Confirm | Reversal entry generated with opposite impact | High | Not Run |
| FIN-UAT-014 | Voucher | Available actions by status | Vouchers across statuses exist | 1) Open approvals/list 2) Compare action buttons | Buttons match workflow rules for each status | Medium | Not Run |
| FIN-UAT-015 | AP/AR | Create payable bill | Supplier exists | 1) Open bills/AP flow 2) Create payable bill 3) Save | Bill created with correct amount and due date | High | Not Run |
| FIN-UAT-016 | AP/AR | Aging bucket calculation | Bills with mixed due dates exist | 1) Open AR/AP aging 2) Set as-of date 3) Refresh | Rows and bucket totals match overdue days logic | High | Not Run |
| FIN-UAT-017 | AP/AR | Allocate payment to bill | Bill exists with outstanding amount | 1) Allocate partial/full amount 2) Save | Outstanding reduces correctly and cannot go negative | Critical | Not Run |
| FIN-UAT-018 | Purchase/AP | Create AP bill from PO | Approved PO exists | 1) Open Purchase Workflow 2) Click create AP bill from PO | Bill created once with correct amounts | High | Not Run |
| FIN-UAT-019 | Purchase/AP | Create AP bill from GRN | Received GRN exists | 1) Open GRN section 2) Create AP bill from GRN | Bill uses received quantities and correct totals | High | Not Run |
| FIN-UAT-020 | Banking | Create Bank Account with GL mapping | Bank GL account exists in COA | 1) Open Bank Accounts 2) Create account 3) Save | Bank account saved and linked to selected GL | High | Not Run |
| FIN-UAT-021 | Payment Runs | Create payment run | Payable bills/outstanding items exist | 1) Open Payment Runs 2) Create run with items | Run created in initial status with totals | Critical | Not Run |
| FIN-UAT-022 | Payment Runs | Approve and process run | Payment run in initial status exists | 1) Approve 2) Process | Status transitions follow workflow | High | Not Run |
| FIN-UAT-023 | Payment Runs | Execute run and generate voucher | Processed run exists; period open | 1) Execute payment run | Linked voucher generated/posted and run marked executed | Critical | Not Run |
| FIN-UAT-024 | Payment Runs | Bank balance update on execute | Bank account + run amount available | 1) Note opening bank balance 2) Execute run 3) Recheck balance | Bank balance updated accurately by executed amount | Critical | Not Run |
| FIN-UAT-025 | Reconciliation | Create bank reconciliation | Bank account exists | 1) Open reconciliation page 2) Create for period | Reconciliation created in open state | High | Not Run |
| FIN-UAT-026 | Reconciliation | Add manual statement line | Open reconciliation exists | 1) Add line with date/ref/amount 2) Save | Statement line appears in list | Medium | Not Run |
| FIN-UAT-027 | Reconciliation | CSV statement import | Open reconciliation exists and CSV ready | 1) Import CSV lines 2) Confirm | Valid lines imported; invalid rows reported clearly | High | Not Run |
| FIN-UAT-028 | Reconciliation | Auto-match statement lines | Executed payment runs and statement lines exist | 1) Click auto-match | Matching lines linked correctly with summary update | High | Not Run |
| FIN-UAT-029 | Reconciliation | Manual match and unmatch | Open reconciliation with unmatched lines | 1) Manual match 2) Manual unmatch | Both actions work and update counts/amounts | High | Not Run |
| FIN-UAT-030 | Reconciliation | Finalize permissions and lock | Reconciliation has review-ready state | 1) Finalize as manager/admin 2) Retry edits | Finalize allowed only for authorized role; edits blocked after finalize | Critical | Not Run |
| FIN-UAT-031 | Reconciliation | Match audit logs export | Match/unmatch events exist | 1) Open logs 2) Export CSV | Audit entries and CSV export available | Medium | Not Run |
| FIN-UAT-032 | Periods | Create accounting period | Authorized user logged in | 1) Open Accounting Periods 2) Create period | New period created with open status | High | Not Run |
| FIN-UAT-033 | Periods | Close and reopen accounting period | Existing open period exists | 1) Close period 2) Reopen period | State changes persist and enforcement follows state | Critical | Not Run |
| FIN-UAT-034 | Reports | Day Book print/export parity | Day Book has data | 1) Open report 2) Print 3) Export CSV | Print dialog opens; CSV downloads with expected data | Medium | Not Run |
| FIN-UAT-035 | Reports | Trial Balance print/export parity | Trial Balance has data | 1) Open report 2) Print 3) Export CSV | Print and CSV both work with correct totals | Medium | Not Run |
| FIN-UAT-036 | Reports | Financial Statements print/export parity | Statement data available | 1) Open report 2) Print 3) Export CSV | Print and CSV work; values match on-screen cards | Medium | Not Run |
| FIN-UAT-037 | Reports | Group Summary print/export parity | Trial data available | 1) Open report 2) Print 3) Export CSV | Group totals export correctly | Medium | Not Run |
| FIN-UAT-038 | Reports | Ratio Analysis print/export parity | Statement data available | 1) Open report 2) Print 3) Export CSV | Ratios show and export correctly | Low | Not Run |
| FIN-UAT-039 | Reports | Cash Flow print/export parity | Cash forecast scenarios exist | 1) Open report 2) Print 3) Export CSV | Scenario lines export and print correctly | Medium | Not Run |
| FIN-UAT-040 | Reports | AR/AP Aging print/export parity | Aging data exists | 1) Open report 2) Print 3) Export CSV | Buckets and rows export correctly | Medium | Not Run |
| FIN-UAT-041 | Reports | Ledger Activity print/export parity | Account and voucher data exist | 1) Select account/date 2) Print 3) Export CSV | Running balance lines export accurately | Medium | Not Run |
| FIN-UAT-042 | Reports | Voucher Analytics print/export parity | Voucher data exists | 1) Open page 2) Print 3) Export CSV | Summary/monthly/top preparers export correctly | Medium | Not Run |
| FIN-UAT-043 | Security | Tenant data isolation | Two tenants with distinct finance data | 1) Login tenant A 2) Check lists/reports 3) Login tenant B | No cross-tenant data visible anywhere | Critical | Not Run |
| FIN-UAT-044 | Security | API role enforcement | Non-privileged user exists | 1) Trigger protected API via UI | Server rejects unauthorized operations consistently | Critical | Not Run |

---

## Execution Notes

- Run all `Critical` tests first for go/no-go decision.
- Capture screenshot for each `Fail` with exact date/time and user.
- Re-test failed cases after fix and update status to `Pass` only after full flow is revalidated.

---

## Defect Mapping (Optional)

Add defect IDs next to failing test IDs:
- Example: `FIN-UAT-023 -> BUG-142 (Payment run execute posts wrong amount)`

