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
