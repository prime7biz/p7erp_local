# Known code-level issues found during AI configuration work

Found while configuring and validating the multi-agent setup (2026-11-06). **None of these has been fixed.** Application
code was intentionally not changed. Each item needs a normal planned change (CRITICAL mode for KI-01 and KI-02) and user
approval. Agents must not re-report these as new findings, but they must flag any change that makes one reachable or worse.

| ID | Area | Status | Severity (current) |
|---|---|---|---|
| KI-01 | Inventory, tenant isolation | Open, latent | Low today (unreachable), High if a caller is added |
| KI-02 | Commercial, posting idempotency | Open | Medium (needs a double submit; unverified in practice) |
| KI-03 | Finance, posting idempotency design | Open, by design | Informational |
| KI-04 | Commercial chain data model | Policy gap | Informational, needs a business decision |
| KI-05 | Merchandising and production hierarchy | Policy gap | Informational, needs a business decision |
| KI-06 | HR employee identity fields permission | Open, by user decision (2026-11-09) | Medium (planned special permission) |
| KI-07 | HR onboarding checklist consent tasks | Open, by user decision (2026-11-09) | Informational |
| KI-08 | Payroll bank file has no status check | Fixed 2026-11-10 | Low (manager-only download) |
| KI-09 | Payroll run maker-checker not enforced | Fixed 2026-11-10 (opt-in tenant flag) | Informational, needs a business decision |
| KI-10 | ESS payslip response uses float money and echoes file_path | Fixed 2026-11-10 | Low |

## KI-01: `calculate_job_work_cost` loads a record without a tenant check

- **Where:** `backend/app/modules/inventory/job_work_costing_service.py`, function `calculate_job_work_cost(db, idt_id)`, around line 104.
- **What:** it calls `db.get(InterDepartmentTransfer, idt_id)` and takes no `tenant_id`, so it does not check that the
  transfer belongs to the caller's tenant.
- **Why it is latent:** a repository search found no callers. Other modules import only `calculate_job_work_cost_from_idt`,
  which receives an already loaded (tenant-checked) transfer. Confirmed independently by the plan-auditor run and by direct search.
- **Suggested fix (not applied):** add a `tenant_id` parameter and a tenant check (or remove the unused function), plus a
  cross-tenant test. Until then, do not call this function.

## KI-02: no row lock around BTB LC opening posting

- **Where:** `POST /btb-lcs/{lc_id}/record-opening` in `backend/app/modules/commercial/router.py`. The whole
  `backend/app/modules/commercial/` package contains no `with_for_update`.
- **What:** the handler checks `BtbLcAccounting.lc_open_voucher_id` and then writes the voucher without locking the row,
  so two concurrent submits could both pass the check.
- **Suggested fix (not applied):** lock the BTB LC accounting row before the check and add a double-submit test.
  Review the document-acceptance and realization handlers the same way.

## KI-03: posting idempotency depends on application code

- **What:** `vouchers` has no database unique constraint on `(tenant_id, source_module, source_module_ref)`. Idempotency
  relies on row locks, status guards and link columns in each posting path.
- **Implication:** every new posting path must lock, guard and test double submits. A database constraint would be a
  migration with a business impact (existing duplicates?) and needs a decision.

## KI-04: commercial chain links are nullable

- **What:** `proforma_invoices.master_contract_id` and `btb_lcs.master_contract_id` are nullable. An `EXPORT` PI does not
  require a contract (only `IMPORT` PIs do). The business intent "MSC/LC links to PI, BTB LC links to MSC/LC" is therefore
  not enforced by the schema.
- **Decision needed:** whether to enforce it, and how to treat existing rows. Do not add NOT NULL without approval.

## KI-05: Style versus Order as the primary key for execution

- **What:** the business rule says Style is primary for merchandising and production. `Order.style_id` and many production
  `style_id` / `order_id` columns are nullable, and `docs/ORDER_EXECUTION_SPINE.md` names the Order as the status source.
- **Decision needed:** confirm the intended hierarchy before any change that depends on it.

## KI-06: NID, date of birth, mobile and the legacy address are editable with `hr.access`

- **Where:** `backend/app/modules/hr/employee_service.py` (`IDENTITY_PROFILE_FIELDS` protects family, religion,
  nationality, present / permanent address, emergency relation and the bKash flag with `hr.identity.manage`) versus
  `national_id`, `birth_registration_no`, `date_of_birth`, `phone`, `address_line`, `city`, `country`, which keep the
  pre-existing rule (any user with HR module access may change them; they are still masked for viewers without HR access).
- **Decision (user, 2026-11-09):** keep them editable for now; a special permission will be added later.
- **When doing it:** add the fields to the protected set, check recruitment `hire_candidate` and Excel import callers,
  and extend `tests/test_hr_employee_sensitive_masking.py`.

## KI-07: identity-document and CV consent checklist tasks are not created

- **Where:** `backend/app/modules/hr/onboarding_tasks.py` (`applicable_task_types`).
- **What:** `IDENTITY_DOCUMENT_CONSENT` and `CV_CONSENT` exist in the schema, but no screen records those privacy
  consents yet, so creating the tasks would leave them pending forever. Evidence matching is already implemented.
- **Decision (user, 2026-11-09, as recommended):** create them only after a consent-capture screen exists.

## KI-08: payroll bank file has no status check

- **Where:** `GET /hr/payroll/runs/{run_id}/bank-file` in `backend/app/modules/hr_payroll/router.py` (around line 1773).
- **What:** the bank advice CSV can be downloaded for a run in any status (DRAFT, FINALIZED…), while the payroll guide
  says to download it after approval. The UI only offers it as a visible button on POSTED runs, but the menu item and the
  API still allow any status.
- **Fixed (2026-11-10, user decision):** APPROVED / POSTED only; other statuses get 400 "The bank file is available
  after the run is approved". The UI disables Bank CSV before approval. Tests `tests/test_hr_payroll_four_eyes.py`.

## KI-09: payroll run maker-checker is not enforced

- **Where:** `approve_run` in `backend/app/modules/hr_payroll/router.py`.
- **What:** the user who finalized a run can also approve it. Nothing in code requires a different approver.
- **Fixed (2026-11-10, user decision):** tenant flag `payroll_four_eyes_approval` (default OFF, strict `true`). When on,
  `approve_run` and the approval decision endpoint (APPROVED only; rejecting stays open) refuse the user who finalized
  the run (or created it when no finalizer is stored) with 403; admins are not exempt. `approve_run` now locks the run
  row. Settings → Configuration refuses to switch it on with fewer than 2 active admin / manager users and audits every
  change (`settings.payroll_four_eyes_approval`). Rollback: switch the flag off.

## KI-10: ESS payslip response uses float money and echoes the internal file path

- **Where:** `my_payslips` in `backend/app/modules/hr_ess/router.py` (`PayslipResponse` in `hr_ess/schemas.py`).
- **What:** `gross_pay`, `deductions` and `net_pay` are converted with `float()` (display only, nothing is posted from them),
  and `download_url` returns the stored `file_path` (a server path, not a usable link; the UI downloads through
  `/hr/payroll/payslips/{id}/pdf` instead).
- **Fixed (2026-11-10, user decision):** the three amounts are 4-decimal text (same as the payroll API) and
  `download_url` is always null. The P7 frontend is the only client in this repository. Test
  `tests/test_hr_ess_payslip_period.py`.
