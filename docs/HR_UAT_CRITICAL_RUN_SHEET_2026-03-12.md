# HR UAT Critical Run Sheet (2026-03-12)

Use this sheet to execute critical HR tests first.

Status values:
- Not Run
- Pass
- Fail
- Blocked

---

## Session Info

- Date: 2026-03-12
- Environment: Docker local (backend smoke)
- Tenant A: LAKHSMA4821
- Tenant B: P7UATB2026
- Tester: AI Agent (backend verification)

---

## Critical Cases (Must Pass)

| Test ID | Scenario | Status | Evidence | Defect ID | Notes |
|---|---|---|---|---|---|
| HR-UAT-001 | HR user login with company code | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Login with `company_code` succeeded for tenant `LAKHSMA4821` |
| HR-UAT-004 | Duplicate department validation | Pass | `python scripts/verify_hr_uat_extended_api.py` |  | Duplicate department blocked with `400` |
| HR-UAT-007 | Duplicate designation validation | Pass | `python scripts/verify_hr_uat_extended_api.py` |  | Duplicate designation blocked with `400` |
| HR-UAT-008 | Create employee with required fields | Pass | `python scripts/verify_hr_uat_extended_api.py` |  | Employee create returned `201` |
| HR-UAT-014 | Activate/deactivate employee | Pass | `python scripts/verify_hr_uat_extended_api.py` |  | Deactivate and activate both returned `200` |
| HR-UAT-015 | Reporting manager self-check | Pass | `python scripts/verify_hr_uat_extended_api.py` |  | Self-manager update blocked with `400` |
| HR-UAT-016 | Tenant data isolation | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Tenant A and Tenant B department lists are isolated |
| HR-UAT-017 | Unauthorized access blocked | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Protected endpoint blocked without token (`403`) |
| HR-UAT-018 | User-tenant mismatch blocked | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Mismatch request blocked with `403` |
| HR-UAT-022 | Attendance daily entry | Pass | `python scripts/verify_hr_critical_flows.py` |  | Entry exists in tenant data |
| HR-UAT-023 | Attendance regularization workflow | Pass | `python scripts/verify_hr_critical_flows.py` |  | Latest regularization is `APPROVED` |
| HR-UAT-025 | Leave request workflow | Pass | `python scripts/verify_hr_critical_flows.py` |  | Latest leave request is `APPROVED` |
| HR-UAT-028 | Payroll run lifecycle | Pass | `python scripts/verify_hr_critical_flows.py` |  | Run `POSTED` with `APPROVED` action record |
| HR-UAT-029 | Payroll post with finance integration | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Posting succeeded and created finance voucher (`voucher_id=5`) |
| HR-UAT-030 | Payroll post blocked in closed period | Pass | `python scripts/verify_hr_uat_critical_api.py` |  | Closed period correctly blocked posting (`400`) |
| HR-UAT-034 | ESS self-data isolation | Pass | `python scripts/verify_hr_ess_self_data_isolation.py` |  | Verified `my-profile`, `my-leave-requests`, `my-attendance-summary`, and `my-payslips` return self data only |

---

## Recommended Execution Order

1. HR-UAT-001
2. HR-UAT-008
3. HR-UAT-004
4. HR-UAT-007
5. HR-UAT-014
6. HR-UAT-015
7. HR-UAT-016
8. HR-UAT-017
9. HR-UAT-018
10. HR-UAT-022
11. HR-UAT-023
12. HR-UAT-025
13. HR-UAT-028
14. HR-UAT-029
15. HR-UAT-030
16. HR-UAT-034

---

## Quick Rule

- Continue phase confidently when all critical tests are Pass.
- If any critical test is Fail/Blocked, fix and re-test before moving ahead.

