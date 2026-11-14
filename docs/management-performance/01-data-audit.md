# 01 - Data audit (Phase 0, 2026-11-14)

Script: `docker compose exec backend python scripts/mgmt_performance_data_audit.py` (read-only, counts only).
Local Docker database, 4 tenants. Production numbers must be re-checked with the same script before go-live.

## 1. Results (local database)

| Check | Tenant 1 (demo) | Other tenants |
|---|---|---|
| Stock groups with `stock_nature = FINISHED_GOODS` | 0 | 0 |
| Finished-goods IN movements (any / with `order_id`) | 0 / 0 | 0 / 0 |
| Process orders linked to an order | 2 of 2 | 0 |
| Process order cost lines | 4 | 0 |
| PO lines linked to an order | 20 of 21 | 3 of 3 (tenant 4707) |
| Budgets FINAL / DRAFT | 1 / 1 | 0 |
| Budget lines with a cost centre | 4 of 5 | 0 |
| Active cost centres | 14 | 0 |
| Expense accounts / expense groups | 45 / 19 | 44 / 18 |
| Expense voucher lines (last 90 days) with a cost centre | 5 of 7 | 0 |
| Active employees / with a salary structure today | 17 / 3 | 5 / 5, 1 / 1 |
| Attendance entries this month / finalised payroll runs | 0 / 0 | 0 / 0 |

## 2. What the code tells us (verified)

1. **No dedicated finished-goods receipt document.** Stock enters through `stock_movements` (`movement_type` IN).
   Kinds written by the app: `GRN_RECEIPT`, `GRN_RECEIPT_QUARANTINE`, `PROCESS_OUTPUT`, `WAREHOUSE_TRANSFER_IN`,
   `IDT_RECEIVE`, `CONSIGNMENT_RECEIPT`, GRN QC moves `*_IN` (`reference_type` `GRN_QC`), stock adjustments
   (`STOCK_ADJUSTMENT`), physical counts (`PHYSICAL_COUNT`), manual movements (no kind).
   **Decision used:** a finished-goods receipt = an IN movement of an item whose stock group has
   `stock_nature = FINISHED_GOODS`, into a warehouse that is not quarantine / rejected / production floor, and whose
   reference type is not `WAREHOUSE_TRANSFER`, `GRN_QC`, `STOCK_ADJUSTMENT`, `PHYSICAL_COUNT` and whose kind is not
   `WAREHOUSE_TRANSFER_IN`, `IDT_RECEIVE` (moves between stores are not new output). Only rows with `order_id`
   can be valued; others are counted as "receipts without an order".
2. **Finance must mark finished-goods stock groups** (Inventory > Stock groups > nature = Finished goods). Until
   then the finished-goods tab is empty and says so.
3. **Processing cost** is order-linked through process orders (`source_order_id` / `linked_order_id`,
   `processing_charges` + `process_order_cost_lines`). Knitting / dyeing done in-house have their own tables
   (`knitting_work_orders`, `dye_batches`) without money columns, so in-house processing cost comes from the
   quotation budget.
4. **Landed cost** (freight, duty, insurance, clearing) has no order-level table. It is only in the ledger.
   **Decision used:** posted ledger amounts on accounts mapped to DIRECT_LANDED / DIRECT_SELLING in the month are
   deducted at company level as "Unallocated landed and selling cost (posted)"; they are never added to an order.
5. **Material** is order-linked through PO lines (`coalesce(line.source_order_id, po.source_order_id)`) and the
   approved Order BOM; reused from `mfg_intelligence/cost_at_completion_service.py` (procured + remaining budget).
6. **Budgets** have only two statuses: `DRAFT` and `FINAL` (`finance/router.py` `BudgetBody`). There is no approval
   step and `PUT /finance/budgets/{id}` deletes and re-creates all lines. **Decision used:** FINAL = approved
   baseline. When `mgmt_performance_v1` is on, a FINAL budget changes only through a budget revision: the old
   PUT / DELETE return 409 for a FINAL budget (DRAFT budgets and DRAFT -> FINAL are unchanged). Flag off = old
   behaviour.
7. **Payroll**: monthly gross per employee = active structure lines priced by `hr_localization/employee_pay.py`
   `price_lines` for the assignment's base salary (batched, no per-employee queries). Loss of pay = ABSENT
   attendance days (same rule as payroll LOP). Approved overtime = `hr_overtime_entries` APPROVED with an amount.
   A finalised payroll run for the month replaces the estimate.
8. **Cost centre owner**: `cost_centers` has a free-text `department` only, no owner user. A nullable
   `owner_user_id` is added (migration 302).

## 3. Gaps listed on the dashboard (never guessed)

- `FG_STOCK_GROUP_NOT_MARKED` - no finished-goods stock group.
- `FG_RECEIPT_WITHOUT_ORDER` - receipt rows with no order link.
- `LANDED_COST_NOT_ORDER_LINKED` - landed cost only at company level.
- `IN_HOUSE_PROCESSING_FROM_BUDGET` - no actual in-house processing cost.
- `EMPLOYEE_WITHOUT_STRUCTURE` - active employees with no salary structure (payroll forecast too low).
- `UNMAPPED_EXPENSE_ACCOUNT` - expense accounts not mapped to a management category.
