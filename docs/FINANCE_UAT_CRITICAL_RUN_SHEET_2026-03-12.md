# Finance UAT Critical Run Sheet (2026-03-12)

Use this sheet to execute only go/no-go critical tests first.

Status values:
- Not Run
- Pass
- Fail
- Blocked

---

## Session Info

- Date: 2026-03-12
- Environment:
- Tenant A:
- Tenant B:
- Tester:

---

## Critical Cases (Must be 100% Pass for GO)

| Test ID | Scenario | Status | Evidence | Defect ID | Notes |
|---|---|---|---|---|---|
| FIN-UAT-001 | Finance user login with company code | Pass |  |  |  |
| FIN-UAT-006 | Create balanced voucher draft | Pass |  |  |  |
| FIN-UAT-007 | Unbalanced voucher rejection | Not Run |  |  |  |
| FIN-UAT-009 | Approve voucher by authorized role | Not Run |  |  |  |
| FIN-UAT-010 | Approve blocked for unauthorized role | Not Run |  |  |  |
| FIN-UAT-011 | Post approved voucher | Not Run |  |  |  |
| FIN-UAT-012 | Post blocked in closed period | Not Run |  |  |  |
| FIN-UAT-017 | Allocate payment to bill | Not Run |  |  |  |
| FIN-UAT-021 | Create payment run | Not Run |  |  |  |
| FIN-UAT-023 | Execute run and generate voucher | Not Run |  |  |  |
| FIN-UAT-024 | Bank balance update on execute | Not Run |  |  |  |
| FIN-UAT-030 | Finalize permissions and lock | Not Run |  |  |  |
| FIN-UAT-033 | Close and reopen accounting period | Not Run |  |  |  |
| FIN-UAT-043 | Tenant data isolation | Not Run |  |  |  |
| FIN-UAT-044 | API role enforcement | Not Run |  |  |  |

---

## Recommended Execution Order

1. FIN-UAT-001
2. FIN-UAT-006
3. FIN-UAT-007
4. FIN-UAT-009
5. FIN-UAT-010
6. FIN-UAT-011
7. FIN-UAT-012
8. FIN-UAT-033
9. FIN-UAT-017
10. FIN-UAT-021
11. FIN-UAT-023
12. FIN-UAT-024
13. FIN-UAT-030
14. FIN-UAT-043
15. FIN-UAT-044

---

## Go/No-Go Quick Rule

- GO only if all 15 critical cases are Pass.
- If any one critical case is Fail/Blocked, mark NO-GO until re-test passes.
