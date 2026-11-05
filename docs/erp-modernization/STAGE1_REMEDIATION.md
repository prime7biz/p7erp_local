# Remediation stage 1 — recovery baseline, tenant ownership, pay-setup authorization

Date: 2026-11-03/04. Local implementation only: **not committed, pushed or deployed**. No production data or
infrastructure was touched. Exploit-level detail and the full candidate classification stay in the private,
git-ignored folder.

## 1. Findings addressed

| Audit ID | What changed | Status after stage 1 |
|---|---|---|
| OPS-01 | Backup + isolated restore-drill scripts (bash and PowerShell); backup runs register real status rows; local drill passed (see [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md)) | **Resolved locally**; production schedule, off-site copy and production drill outstanding |
| OPS-01 (UI) | Settings → Backup & Restore shows `requested / running / completed / failed / unavailable` from real job rows; trigger is a tenant-admin-only request; in-app restore returns 501 instead of faking success; platform backup job records `failed` when `pg_dump` is missing | **Resolved** |
| SEC-03 | Shared ownership helper `backend/app/common/ownership.py`; all 8 confirmed root causes fixed on create **and** update paths, plus defensive tenant checks at every affected read site (internal screens, MRP output, financier portal) | **Resolved in code**; production data scan outstanding |
| SEC-03 (incidental) | ~25 further unchecked related-record IDs fixed across production, inventory, finance vouchers, commercial, trade documents and legacy compliance (including background recurring-voucher generation) | **Resolved in code** |
| HR-04 | Pay setup, run-line edits, assignments, auto-calculate apply and statutory config now require a manager-type role or the explicit `hr.payroll.manage` grant (fail-closed); run lines cannot change inside a locked payroll period | **Resolved in code**; access migration required before deploy |
| HR-02 | Direct attendance edits require manager role or `hr.attendance.manage`, are blocked inside locked payroll periods (also for create, bulk import and regularization approval) and write an audit entry with old → new values; leave-type create/edit requires manager role or `hr.leave.types.manage` | **Resolved in code** (device adapter and OT/proration remain in HR-03/HR-06) |
| SEC-01 / SEC-02 | Read-only report `backend/scripts/rbac_access_report.py` (RBAC mode per tenant, roles that would lose the new HR keys, route prefixes without a module dependency) | **Observation tooling ready**; enforcement change deferred (see §3) |
| BD-03 | Legacy bonded-entry endpoint now validates linked trade case / BTB LC ownership | **Partially resolved** (route still to be retired) |

Not changed in this stage (by design): accounting postings, stock valuation, invoicing quantities, Bangladesh payroll
rules, historical vouchers, balances, payroll results and production records.

## 2. Tests

| Suite | Result |
|---|---|
| New `tests/test_tenant_ownership_regressions.py` (9 tests: the 4 previously reproduced cases made permanent + the other root causes; each checks rejection, no partial write, and same-tenant success) | 9 passed |
| New `tests/test_hr_pay_setup_authz.py` (4 tests) | 4 passed |
| New `tests/test_settings_backup_status.py` (4 tests incl. state derivation and request → completed flow) | 4 passed |
| Existing isolation tests (`test_merch_tenant_isolation`, `test_p5_real_db_and_isolation`, `test_phase5_cross_module`) | 11 passed |
| Full backend suite | 589 passed, 3 skipped |
| Frontend `npm run lint` / `npm run build` | 0 errors (3 pre-existing warnings in untouched files) / build OK |

## 3. Permissions: observe vs enforce

| Item | Decision | Why |
|---|---|---|
| Pay setup, payroll run lines, attendance edits, leave types | **Enforced now (in code)** | Confirmed unauthorized write paths that change pay |
| Module-level RBAC default (`rbac_enforcement` off) | **Observe first** | Changing it affects every screen; needs per-tenant role mapping. Use shadow mode + `rbac_access_report.py` |
| Routers without module dependency (dashboard summaries, control tower, some finance sub-routers, files, compliance) | **Observe first** | Listed by the report; gate in stage 2 with role templates |
| Fail-open soft permission keys | **Observe first** | Converting to explicit grants needs a role migration |

### Access-migration plan for the new HR checks (before deploying stage 1)

1. On production, an authorized operator runs `docker compose exec backend python scripts/rbac_access_report.py`.
   Locally it showed 6 of 11 roles would lose access to the three HR keys (manager/admin roles keep access).
2. For each tenant, HR heads confirm which non-manager roles legitimately maintain payroll, attendance or leave types.
3. Grant `hr.payroll.manage`, `hr.attendance.manage`, `hr.leave.types.manage` to those roles in
   **Settings → Roles** (governance toggles, new "HR & payroll" group), or via role JSON.
4. Deploy; watch 403 responses on `/api/v1/hr/payroll`, `/hr/attendance/entries`, `/hr/leave/types` for one payroll cycle.
5. Rollback: grant the key more widely (no code change), or revert the release.

## 4. Existing-data risks requiring separate repair

- `backend/scripts/check_cross_tenant_links.py` (read-only, aggregate counts only) covers 82 relations.
  Local development DB: **0** cross-tenant rows. Production: **not scanned**.
- If production shows non-zero counts, follow the private repair proposal: triage as a potential incident first,
  then tenant-approved corrections with backup tables, compensating vouchers/stock adjustments, and re-scan. No
  automatic delete or relink.
- Old purchase orders whose vendor link is foreign no longer pass that vendor to new GRNs, reorder or MRP POs; affected
  documents would show no vendor until corrected.

## 5. Production checks still outstanding

| Check | How |
|---|---|
| Existing host-level backup and last successful restore | Server operator |
| Backup schedule, off-site copy, production restore drill, measured RPO/RTO | `BACKUP_RESTORE_RUNBOOK.md` |
| Cross-tenant link scan | `check_cross_tenant_links.py --per-tenant` (authorized operator; output kept off Git) |
| RBAC modes and role mappings per tenant | `rbac_access_report.py` |
| `voucher_lines.base_amount` population (prerequisite for FIN-01) | Reconciliation script in next batch |
| Repository visibility and AI provider decisions | Owner (OPEN_QUESTIONS Q9/Q10) |

## 6. Full-suite result

`docker compose exec backend pytest -q` on 2026-11-04 (local compose database, transactional test fixtures):
**589 passed, 3 skipped**, 0 failed (includes the 17 new tests).

## 7. Next batch — financial and stock integrity (stage 2 proposal)

All items behind tenant flags in warn → enforce mode where behaviour changes; every fix ships with a read-only
reconciliation report run before and after; historical corrections only by accountant-approved compensating
documents.

| # | Task | Audit IDs | Key files | Acceptance |
|---|---|---|---|---|
| 1 | Read-only reconciliation scripts: base vs transaction amounts per account; `.4g`-affected PO/GRN lines; foreign-currency GRNs valued 1:1; duplicate export-PI order links; split-invoice over-invoicing; GRNI/AP residues; skipped inventory GL posts | FIN-01, INV-01, INV-02, COM-01, INV-04, FIN-05 | `backend/scripts/` | Reports run on production by operator; baseline archived |
| 2 | Decimal quantities end to end; remove `.4g` formatting | INV-01 | `merch/bom_procurement_service.py`, `inventory/router.py` | 12,345.6 round-trips; affected rows listed |
| 3 | GRN base-currency costing from PO rate | INV-02 | `inventory/router.py` `_apply_grn_receive_goods` | USD GRN value = qty × price × rate |
| 4 | Locked stock-out helper on issue, consumption, transfer, adjustment, count, IDT (+ IDT availability check) | INV-03, INV-17 | `inventory/router.py`, `idt_service.py` | Concurrency test cannot oversell |
| 5 | Commercial invoice item partitioning for split and consolidated challans | INV-04 | `commercial/commercial_invoice_service.py` | Split/consolidated tests |
| 6 | Server-side block of one order on several issued export PIs; status only via finalize | COM-01 | `commercial/router.py` | 409 on duplicate; tests |
| 7 | Trial balance / balances in base currency with comparison view for one close | FIN-01 | `finance/router.py`, `auto_posting_service.py` | Multi-currency test; per-account reconciliation explained |
| 8 | BTB voucher currency + rate; block BTB amount edits after vouchers | FIN-02 | `commercial/router.py` | USD LC voucher base amount correct |
| 9 | Payroll posting: gross, deductions to liabilities, employer cost, balances applied, row lock + unique posting | FIN-03 | `hr_payroll/router.py`, `models/hr_payroll.py` | Balanced voucher test; double-post → 409 |
| 10 | Posted system vouchers reversible only; balance re-check at post; special vouchers balance check | FIN-04 | `finance/router.py`, `advanced_voucher_*` | Tests per path |
| 11 | Single GRNI/AP account resolver; payment run clears AP; posting-exception queue blocking period close | FIN-05 | `services/inventory_gl_service.py`, `finance/router.py` | GRN → bill → payment leaves GRNI and AP at zero |
| 12 | Bangladesh payroll groundwork: jurisdiction rule-set switch (Indian set disabled for BD tenants), OT basis/multipliers, absence/late deductions, proration — parameters validated by compliance owner before enablement | HR-01, HR-03 | `hr_payroll/payroll_calculation_service.py`, `statutory_calculation_service.py` | Golden payroll cases signed off; parallel run for 2 cycles |

Prerequisites: production backup schedule live and a passing production restore drill; reconciliation baselines (task 1)
archived before tasks 2–11 are enabled for any tenant.
