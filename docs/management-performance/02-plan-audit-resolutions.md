# 02 - Plan audit (verdict REVISE, 2026-11-14) and binding resolutions

Auto `plan-auditor` found 6 HIGH, 4 MEDIUM, 1 LOW. This file **overrides** the plan where they differ.

## Status rules (owner Q and A, finding 1)

The owner chose "at risk when the forecast exceeds the budget; failed when actual posted spend exceeds the budget",
with an early-warning percentage per category. Statuses, worst first:

| Status | Rule |
|---|---|
| FAILED | posted actual > budget |
| AT_RISK | forecast > budget |
| WARNING | forecast >= warning % of budget, or (actual + committed) >= warning % of budget, or run-rate > budget |
| OK | otherwise |
| UNBUDGETED | spend (actual + committed) > 0 and no budget for that cost centre x category |
| UNMAPPED | posted expense on an account that has no management category |

Forecast for the current month (time-phased, so a line at 40% spend in mid-month is OK, not WARNING):

```text
remaining fraction r = days left after today / days in month
estimate to complete = max(committed, budget x r)              (budget exists, source BUDGET_TIME_PHASED)
                     = max(committed, 3-month average x r)     (no budget, source HISTORY_3M)
                     = committed                               (neither)
forecast = actual + estimate to complete
```
Closed months: forecast = actual. Future months: forecast = max(committed, budget or 3-month average).
Payroll category: forecast = max(actual, payroll projection) at company level (section 6).

## Budget data (finding 3)

- Category comes from the budget line's account through the category map. A line with no account, or an unmapped
  account, is UNMAPPED (its amount is still shown).
- All FINAL budgets of the fiscal year are added together (same as budget enforcement / Budget Analytics).
- Quarter and year lines are split evenly over their months with the existing Budget Analytics rule
  (`budget_analytics/common.py` `line_months` + `spread_amount`). This is the established rule in the codebase, not
  a new one.

## Committed cost (finding 2)

- Purchase orders linked to an order (`coalesce(line.source_order_id, po.source_order_id)`) are never opex; that
  material is inside the finished-goods contribution.
- Non-order open PO lines (APPROVED / PARTIALLY_RECEIVED, open quantity = ordered - accepted received) count only
  when the item's stock group purchase account is mapped to an operating category; otherwise they are counted in the
  gap `COMMITTED_UNMAPPED` (count only, never guessed). Dated at the PO expected date; overdue or undated = this month.
- Loan interest: repayment schedule lines due in the month (not paid) of active utilizations, interest component x
  utilization rate, category FINANCE_COST, unless a posted interest accrual exists for that utilization and month
  (then it is already in actual).
- Direct-mapped accounts (DIRECT_*) are never in opex actual.
- Forecast month-end result = finished-goods contribution - unallocated landed / selling cost (posted) - opex
  forecast. Accounting profit is shown beside it, never added.

## Budget revisions and the old budget screen (finding 4)

- `budget_line_revisions.budget_line_id` FK ON DELETE SET NULL plus snapshot columns `budget_id`, `cost_center_id`,
  `account_id`, `period_month`. Kinds CHANGE (existing line) and ADD_LINE (new line, resolves UNBUDGETED).
- Approval locks the revision and the line `with_for_update`, writes `BudgetLine.amount` (or inserts the line) in the
  same transaction, `log_action`. Requester != approver. Unique (tenant, request_id).
- Flag on: `PUT /finance/budgets/{id}` and `DELETE` return 409 for a FINAL budget (also FINAL -> DRAFT). DRAFT
  budgets and DRAFT -> FINAL unchanged. Flag off: unchanged. The budget screen shows the 409 text.

## Exceptions (finding 5)

- `dedupe_key` = `month|cost_centre or 0|category or -|account or 0|family`, unique (tenant, dedupe_key). Family
  BUDGET (severity WARNING < AT_RISK < FAILED), UNBUDGETED, UNMAPPED.
- Scan: per-tenant `pg_advisory_xact_lock`, insert ON CONFLICT DO NOTHING, then raise severity in place. A higher
  severity on a RESPONDED / REVIEWED / APPROVED row re-opens it (status OPEN, `escalated_at`); same or lower changes
  nothing, so an approved exception is never re-created in the same month.
- Workflow OPEN -> RESPONDED (cost-centre owner, or setup key when no owner) -> REVIEWED (`finance.budget.exception.review`)
  -> APPROVED / REJECTED (`finance.budget.exception.approve`). REJECTED goes back to OPEN. Responder != reviewer !=
  approver. Every write: `with_for_update`, status guard, `log_action`, `notify_user`, unique (tenant, request_id)
  on the action log.
- `POST /exceptions/scan`: admin / manager or `finance.budget.exception.review`.

## Authorization (finding 6)

- Company money (`/summary`, `/fg-contribution`, `/targets`, `/cash`, setup GETs): admin / manager role or an
  explicit `true` for `finance.mgmt_performance.view` (or `finance.*` / `*`), every RBAC mode (pattern
  `mfg_intelligence/finance_gate.py`).
- A cost-centre owner without that key sees only `/budget-forecast` and `/exceptions`, filtered to
  `cost_centers.owner_user_id = user.id`; payroll amounts on their rows need `hr.payroll.manage`, else "restricted".
- Setup writes: admin / manager or `finance.mgmt_performance.setup`. `ensure_owned` on account, account group, cost
  centre, owner user (active, same tenant), budget and budget line.

## Finished goods (finding 7)

- Receipts as in `01-data-audit.md`; quarantine / rejected / production floor = `warehouses.is_quarantine`,
  `is_rejected`, `is_production_floor`. There is no reversal document, so nothing is netted; adjustments and counts
  are excluded both ways. Shipment / challan OUT rows are never netted.
- Cap: counted this month = min(received this month, max(0, order qty - received before the month)), prior receipts
  in one grouped query.

## Targets (finding 8)

```text
required contribution = opex forecast x (1 + contingency %) + target profit + unallocated landed / selling (posted)
                      - finished-goods contribution so far
marketing gap value   = max(0, required contribution - contribution of confirmed orders due this month on
                        their not-yet-received quantity) / expected contribution %
```
Contribution % <= 0 or unknown -> UNKNOWN. Quarter / year: amounts summed, percentages recomputed from the sums.

## QA review round 1 (2026-11-14, verdict FAIL -> fixed)

- Owner totals leave out restricted payroll rows (payroll could otherwise be worked out from the total).
- Budget revisions hide amounts of PAYROLL lines from viewers without payroll rights (`restricted: true`).
- Payroll projection that is incomplete (no active employees, or employees without a salary structure) can only
  raise the forecast: base = the normal forecast instead of the posted actual.
- Company-level commitments (non-order POs, loan interest) are first set against the rest-of-month budget of the
  same category on the cost-centre rows: category forecast = actual + max(committed, remaining budget). A company
  row whose commitment fits inside that budget has forecast 0 and is not UNBUDGETED (UNBUDGETED = posted spend, or a
  commitment that still adds to the forecast).
- An exception request id reused by another user returns 409 (was a silent replay).
- Decisions recorded (no code change):
  - The page is a Finance page: under RBAC enforce every user, cost-centre owners too, also needs `finance.access`
    (router-level gate of `/finance`). Owners without it are blocked on purpose.
  - Payroll projection runs once per open month of the period (about 6 queries each, at most 12 months): bounded by
    the period, never by the number of employees or rows.
  - Buying commission comes from the order terms only; commission expense accounts must be mapped to EXCLUDED, never
    DIRECT_SELLING, or it would be deducted twice.
  - Creating a new FINAL budget with `POST /finance/budgets` stays allowed while the flag is on (it adds a budget,
    it does not change an approved one). Open owner question: should a new FINAL budget also need approval?

## Performance, migration, tests (findings 9-11)

- `load_batch` once per page; one grouped query each for 3-month history, payroll, receipts; query-count test.
  Period at most one fiscal year.
- Migration 302 follows the 300 RLS pattern; category map CHECK exactly one of account / group, unique (tenant,
  account) and (tenant, group); nearest group wins (account mapping beats group, child group beats parent).
  Thresholds unique (tenant, category), CHECK 0-100. Targets unique (tenant, month). Money Numeric(18,4).
- Tests add: GET writes nothing, money as decimal strings, cash only behind the money gate, items above.
