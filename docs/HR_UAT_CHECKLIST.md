# HR Module UAT Checklist (Phase 1 - Core HR)

Purpose: Verify Core HR in P7 works correctly for departments, designations, and employees.

Use this checklist during UAT and mark each test as:
- PASS
- FAIL (with screenshot + error note)
- BLOCKED (with reason)

---

## 1) Test Setup (Run First)

- [x] Login works with `company_code` + username/email + password.
- [x] HR menu is visible in sidebar.
- [x] Tenant has at least 2 users for role/security checks.
- [x] Migration `021_hr_core_masters.py` is applied.
- [x] Demo HR data seeded (optional but recommended):
  - `python scripts/seed_hr_demo.py`

---

## 2) Department Masters

- [x] Create department with unique code + name.
- [x] Edit department details.
- [x] Department list reflects saved values after reload.
- [x] Duplicate code or name is blocked with clear error.

---

## 3) Designation Masters

- [x] Create designation with unique code + title.
- [x] Map designation to a department.
- [x] Edit designation details and mapping.
- [x] Designation list reflects updates after reload.
- [x] Duplicate code or title is blocked with clear error.

---

## 4) Employee Masters

- [x] Create employee with required fields (`employee_code`, `first_name`).
- [x] Optional fields save correctly (last name, email, phone, joining date).
- [x] Department and designation mapping saves correctly.
- [x] Employee list search works (code/name/email).
- [x] Active/inactive filter works.
- [x] Employee detail page loads and updates correctly.
- [x] Employee activate/deactivate actions work.
- [x] Employee cannot be set as own reporting manager.

---

## 5) Tenant + Security Checks

- [x] Tenant isolation: Tenant A cannot access Tenant B HR data.
- [x] Unauthorized request without token is blocked.
- [x] Missing/invalid tenant header is blocked.
- [x] User-tenant mismatch is blocked with forbidden response.

---

## 6) API + UX Stability

- [x] API errors return clear messages (duplicate, invalid FK, not found).
- [x] Empty states show clear guidance on list pages.
- [x] Basic mobile/tablet layout remains usable (no broken page).

---

## 7) Attendance + Leave

- [x] Shift master create/edit/list works.
- [x] Attendance entry save/update/list works.
- [x] Attendance regularization submit/approve/reject works.
- [x] Leave type/policy setup works.
- [x] Leave request submit/approve/reject works.
- [x] Leave balance updates correctly after approval.

---

## 8) Payroll

- [x] Payroll component and salary structure setup works.
- [x] Payroll period create/finalize works.
- [x] Payroll run create/finalize/approve works.
- [x] Payroll posting creates finance voucher and blocks in closed period.
- [x] Payslip generation/list works.

---

## 9) Performance + Recruitment + ESS

- [x] Performance cycle, goal, and review submit flows work.
- [x] Recruitment requisition/candidate/interview/offer flows work.
- [x] ESS profile update works for logged-in user only.
- [x] ESS leave/attendance/payslip endpoints return only self data.

---

## 10) Defect Log Template

Use this format for each failed case:

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

## Suggested Execution Order

1. Setup -> 2. Core HR -> 3. Attendance/Leave -> 4. Payroll -> 5. Performance/Recruitment/ESS -> 6. Tenant/Security -> 7. API/UX stability

