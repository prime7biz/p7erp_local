# HR Parity Gap Tracker (PrimeX -> P7)

Last updated: 2026-03-12

Purpose: Track what is complete vs pending for HR module parity in clear phases.

Status legend:
- DONE
- IN PROGRESS
- TODO

---

## P0 (Critical)

| Item | Status | Notes |
|---|---|---|
| HR core backend APIs (departments/designations/employees) | DONE | Unified `/api/v1/hr/*` module added with tenant checks. |
| HR core frontend pages and routes | DONE | Departments, Designations, Employees, Employee Detail pages added. |
| HR migration + schema readiness | DONE | Migration `021_hr_core_masters.py` added with indexes and constraints. |

---

## P1 (High parity)

| Item | Status | Notes |
|---|---|---|
| HR seed data for demo/UAT | DONE | `backend/scripts/seed_hr_demo.py` added (idempotent). |
| Core HR UAT checklist and test cases | DONE | Initial docs added for Phase 1 execution. |
| Employee list filters and search parity | DONE | Search + active/inactive filters available in HR employees list. |
| Delete safety rules for masters with dependencies | DONE | Department/designation delete now blocked when linked records exist; clear message returned. |
| Role guard hardening for sensitive HR actions | DONE | Manager/admin guard added for delete and employee activate/deactivate actions. |

---

## P2 (Next wave)

| Item | Status | Notes |
|---|---|---|
| Attendance basics (`/hr/attendance`) | DONE | Attendance models, migrations, routers, and frontend pages added. |
| Leave basics (`/hr/leave-*`) | DONE | Leave types, balances, requests, approvals backend+frontend implemented. |
| Payroll MVP (`/hr/payroll/*`) | DONE | Payroll components, structures, periods, runs, approvals, payslips implemented. |
| HR reports (CSV/print parity) | DONE | HR report dashboard pages and API client hooks added. |
| Finance integration for payroll posting | DONE | Payroll posting now creates finance voucher lines with period lock checks. |

---

## Suggested Next Completion Order

1. Run full advanced HR UAT and update statuses in `docs/HR_UAT_TEST_CASES.md`.
2. Execute critical-first run via `docs/HR_UAT_CRITICAL_RUN_SHEET_2026-03-12.md`.
3. Validate payroll-finance reconciliation samples with business users.
4. Complete sign-off using `docs/HR_GO_LIVE_CRITERIA.md`.
5. Execute production cutover runbook in `docs/HR_CUTOVER_PLAN.md`.

