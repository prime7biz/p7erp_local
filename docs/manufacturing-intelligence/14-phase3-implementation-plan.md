# 14 - Phase 3 implementation plan (cost and finance intelligence)

Mode: CRITICAL (finance, margins, cash). Author: parent agent (Auto), 2026-11-13. Status: owner decisions taken
(sections 10, 13: industry standard); two `plan-auditor` rounds done, every finding has a binding resolution
(sections 12, 14); build needs explicit owner approval.

## 1. Goal and non-goals

Show, per order and for the factory, what production **will** cost and how much cash it **will** need, next to
what the ledger already says. Answer: "What will this order cost at completion, what margin is left, and how much
cash do we need in the next 90 days and when?"

Non-goals: no voucher, posting, accrual or allocation is ever written; no overhead allocation (finance decision
10-14); no change to finance profitability, cash-forecast scenarios or statements; no new FX source; no AI.

## 2. What already exists (reuse, do not rebuild)

| Need | Existing component | Evidence |
|---|---|---|
| Actual cost / revenue per order, style, LC, buyer (POSTED GL, explicit links, unattributed bucket) | `finance/control/profitability_service.py` `build_entity_profit`, `list_order_profit` | module docstring lines 1-24 |
| Planned (budget) revenue / material / CM / other per order, converted with the quotation's stored rate | same, `_budget_and_counts` | lines 303-330 |
| Open purchase-order supply per order and ETA chain | `inventory/open_po_supply_service.py` (Phase 2) | doc 13 section 5 |
| Order progress and predicted finish / ship dates | `mfg_intelligence/delivery_service.py` | doc 07, Phase 1 |
| BTB LC maturities | `commercial.BtbMaturityTranche` (maturity_date, amount, currency, status) | `models/commercial.py:248-266` |
| Loan instalments | `facility.RepaymentScheduleLine` (due_date, emi_amount, status) | `models/facility.py:149-176` |
| Vendor payment terms | `Vendor.payment_terms_days` | `models/inventory.py:116` |
| Opening cash | finance statements classification (cash-in-hand + bank classes) | finance PLAN decision 3a |
| Finance gate | `finance.access` (fail-closed with `strict_sensitive_permissions`) | `common/permissions.py:783`, `:976-984` |

Not reused: the finance cash-forecast scenario generator (`finance/router.py:3813-3966`) uses an average of recent
debits with fixed factors and floats; it is not schedule-driven. It is left unchanged (owned by the finance
program); Phase 3 adds a separate, source-traced cash requirement and the finance team may later replace their
heuristic with it.

## 3. Value classes (never mixed, always labelled)

| Class | Meaning | Source |
|---|---|---|
| ACTUAL | Posted, in-books GL | finance profitability service |
| COMMITTED | Ordered, not yet billed / posted | open PO lines linked to the order (`source_order_id`), net of billed / received-and-posted quantity |
| ESTIMATED | Calculated remaining cost | formulas below |
| FORECAST | Dated future cash movement | section 5 |

Estimated and forecast values are never presented as accounting entries (UI label "Estimate - not posted").

## 4. Order cost at completion (per confirmed order)

All amounts in base currency, Decimal, 4 decimals.

- **BAC** (budget at completion) = quotation budget material + CM + other (finance `_budget_and_counts`).
- **AC** (actual) = finance order actual material + CM + other (+ overhead / finance cost shown separately, not in
  EAC because finance does not allocate overhead).
- **Committed material** = sum over open PO lines with `source_order_id = order` of
  open_qty x unit_price x stored PO rate (open_qty from `open_po_supply_service`; lines already billed are excluded
  so a cost is never both ACTUAL and COMMITTED). Missing rate for a foreign-currency PO => line UNKNOWN (listed).
- **Progress p** = produced good quantity / order quantity, capped at 1 (hourly good quantity; fallback plan
  `completed_qty`; source stated in `progress_source`).
- **Remaining material (ESTIMATED)** = max(0, budget material - actual material - committed material).
- **Remaining conversion (ESTIMATED, base)** = (budget CM + budget other) x (1 - p).
- **Remaining conversion (pessimistic)** = remaining conversion / CPI, where CPI = earned conversion / actual
  conversion (earned = (budget CM + other) x p); only when both > 0; CPI clamped to 0.5-2.0; else = base.
- **Absorbed overhead (ESTIMATED)** = earned SAH minutes x CPM (section 10 Q6); conversion CPI uses actual
  conversion + absorbed overhead so it is compared like-for-like with budget CM.
- **EAC** = AC + absorbed overhead + committed material + remaining material + remaining conversion (base and
  pessimistic).
- **Revenue at completion** = contract value (section 10 Q1).
- **Projected margin** = revenue at completion - EAC; margin % = margin / revenue (null when revenue is 0).
- **Status**: COMPLETE_DATA / PARTIAL (missing budget, rate, progress) / UNKNOWN; `missing_inputs`, `reason_codes`.

## 5. Cash requirement (factory, next N days, weekly buckets)

Read-only, computed per request, not stored (doc 09: snapshots only after measured need). Horizon default 90, max
180 days. Each row carries `source_type`, `source_id`, `date_rule`, `confidence` (CONTRACTUAL / SCHEDULED /
ESTIMATED) and base amount.

Outflows:
1. BTB LC maturity tranches with status UPCOMING (CONTRACTUAL).
2. Facility repayment lines upcoming / due / overdue / partially paid (CONTRACTUAL; overdue shown in week 1).
3. Accounts-payable outstanding bills by due date (SCHEDULED) - billed purchases are paid from here, not from the PO.
4. Open, not yet billed local purchase orders: open value due on expected receipt date + vendor
   `payment_terms_days` (SCHEDULED). BTB-funded purchases only through item 1 (section 10 Q3).
5. Payroll: last finalised run total on the 7th working day of the next month (section 10 Q4, ESTIMATED).

Inflows:
6. Open export commercial invoices not fully realised: invoice date + document days + usance days (Q2), net of
   receipts already allocated (SCHEDULED).
7. Confirmed, not yet invoiced orders: remaining contract value (Q1) on predicted ship date (Phase 1 delivery
   likely date) + document days + usance days (ESTIMATED; UNKNOWN when no prediction).

Opening balance = classified cash + bank at the start date. Output per week: inflow, outflow, net, closing; the first
week whose closing balance is below zero is flagged `FINANCING_GAP` with the shortfall.

## 6. API (prefix `/api/v1/mfg-intelligence`; read-only; flag `mfg_cost_intelligence_v1`)

| Method / path | Permission | Notes |
|---|---|---|
| GET `/orders/{id}/cost-at-completion` | `production.planning.read` + `finance.access` | section 4 |
| GET `/cost-at-completion?status=&limit<=200&offset` | same | confirmed orders, batched (no per-order queries) |
| GET `/cash-requirement?date_from&horizon_days<=180` | same | section 5, weekly buckets + rows (rows bounded 2,000, `truncated`) |

New code lives in `mfg_intelligence/` (read-only, covered by `test_mfg_intelligence_read_only.py`):
`cost_at_completion_service.py`, `cash_requirement_service.py`, schemas, router entries. It calls finance services,
never copies their queries. No migration. Flag helper in `tenant_feature_keys.py` (strict, never default-on) and a
Settings switch that requires `manufacturing_intelligence_v1`.

## 7. Frontend (panel F)

New tab **Cost & cash** in `ManufacturingIntelligenceSection` (flag + `finance.access` hint from
`/planning-permissions`, extended with `can_view_finance`): order cost-at-completion table (budget / actual /
committed / estimate / EAC / margin with class chips and drill links to finance order profitability), weekly cash
chart + table with source rows, financing-gap banner, missing-data list. Tutorial article `mfg-intel-cost-cash`.

## 8. Tests

Pure formula tests (progress caps, CPI clamp, no negative remaining, zero revenue); ACTUAL vs COMMITTED never
double counted (billed PO line); foreign PO without rate = UNKNOWN; cross-tenant 404; permission denial with RBAC
enforce and strict sensitive (no `finance.access` => 403 even with planning read); flag off = 404 and Phase 1 / 2
outputs unchanged; cash buckets equal the sum of their rows; BTB-covered PO not counted twice; overdue instalment
in week 1; read-only sweep extended; query-count test (no per-order queries); frontend tab gating and labels.

## 9. Acceptance criteria

1. Every amount is traceable to a source row or a documented formula; classes never mixed.
2. EAC reconciles: AC + committed + remaining = EAC exactly (4 decimals).
3. Order actual equals finance `build_entity_profit` for the same order and period.
4. Cash weekly totals equal their rows; opening + net = closing every week.
5. No writes; no change to finance outputs; flag off = byte-identical Phase 1 / 2 responses.
6. Margin and cash visible only with `finance.access` (fail-closed under strict sensitive permissions).

## 10. Owner decisions (2026-11-13: "use the industry standard for every decision")

| # | Question | Decision (industry standard) |
|---|---|---|
| Q1 | Revenue at completion | **Contract value** (earned-value practice: BAC revenue = contract price). Order contract value = the order's share of its proforma invoice / sales contract value where an explicit `proforma_invoice_orders` link and amount exist; shipped part replaced by invoiced actual (commercial invoices); else quotation budget revenue with reason `REVENUE_FROM_QUOTATION`. Never guessed. |
| Q2 | Export realisation timing | Shipment date + document presentation days + usance days. Master contracts store no tenor, so two planning settings: `export_document_days` (default 7) and `export_usance_days` (default 90, deferred-payment LC norm in Bangladesh RMG; 0 = at sight). |
| Q3 | Purchase payment timing | Local / non-LC purchases: expected receipt date + vendor `payment_terms_days` (0 when unset). BTB-LC-funded purchases are paid only at the BTB maturity (UCP 600 usance practice): counted once, through `BtbMaturityTranche`; where a PO cannot be proven BTB-funded or local, it is counted as local and flagged `PO_FUNDING_UNKNOWN` (never counted twice if a link exists). Already-billed purchases come from accounts-payable outstanding bills (due date) instead of the PO. |
| Q4 | Payroll in cash | Included. Bangladesh Labour Act s.123: wages paid within 7 working days after the wage period. Amount = last finalised payroll run total (gross + employer statutory), repeated monthly, due on the 7th working day of the next month (tenant calendar). Total only; no per-person data. |
| Q5 | Who sees cost, margin and cash | Segregation of duties: `finance.access` required (explicit grant when `strict_sensitive_permissions` is on); planners without it see quantities and dates but no money. |
| Q6 | Overhead | Garment costing standard = cost-per-minute (CPM) absorption. Finance P&L stays unallocated (finance decision 10-14 unchanged). Cost-at-completion shows a separate ESTIMATED line "absorbed factory overhead" = earned SAH minutes x CPM, where CPM = posted factory overhead of the trailing 3 closed months / produced SAH minutes of the same months (both from existing data; UNKNOWN when either is missing). The quotation CM already carries overhead, so actual conversion + absorbed overhead is compared like-for-like with budget CM. |
| Q7 | FX | Booked flows use their own stored rate (quotation `exchange_rate`, PO / LC `base_currency_amount` or stored rate, invoice base amount). Future unbooked foreign flows use the tenant's latest stored rate for that currency, labelled `FX_LATEST_RATE`; none => UNKNOWN. No external rate source. |
| Q8 | Progress measure | Earned minutes basis (industry EVM for apparel): p = produced good pieces x SMV / (order qty x SMV) = produced / order qty; produced = QC-passed good quantity (hourly entries), fallback plan `completed_qty`. |

## 11. Risks and rollback

Risks: diverging from finance numbers (reuse their service, test equality); double counting committed vs actual
(exclude billed); FX gaps (UNKNOWN, never guessed); margin leakage (finance gate + tests); performance (batched,
bounded). Rollback: switch the flags off; no data to repair; `git revert`.

## 12. Plan audit (verdict REVISE, 2026-11-13) and binding resolutions

`plan-auditor` returned REVISE: 3 CRITICAL, 7 HIGH, 8 MEDIUM, 3 LOW. Section 12 and 13 **override** sections 2-10 where
they differ. Implementers follow this section first.

| # | Finding | Binding resolution |
|---|---|---|
| 1 CRIT | Order-level GL cost is ~0: only commercial invoices / proforma receipts set `voucher.order_id`; system vouchers, vendor bills and stock issues carry no order | GL order actual is **not** used in EAC. It is shown only as an informational link to finance order profitability (single-order endpoint calls the public `build_entity_profit` once; the list shows a link, no GL figures). Conversion EAC = order SAH minutes x CPM (section 13 Q6); CPM unknown => conversion EAC = scaled budget CM, status PARTIAL, reason `NO_ORDER_COST_POSTING` / `CPM_UNKNOWN`. No CPI. Test: no order-linked cost, p = 1 => EAC conversion = budget CM. |
| 2 CRIT | Open-PO service has no billed / price / order fields | MI adds its own batched read: procured material per order = PO lines where `coalesce(line.source_order_id, po.source_order_id)` = order; status APPROVED / PARTIALLY_RECEIVED / RECEIVED: ordered qty x unit_price x PO header `exchange_rate_to_base`; CLOSED: accepted qty x price x rate; CANCELLED / DRAFT excluded. Material EAC = procured + max(0, material budget - procured). Foreign PO without rate => UNKNOWN. GL material never added (reason `GL_MATERIAL_EXCEEDS_PROCURED` when larger). |
| 3 CRIT | `BtbMaturityTranche` is never written by the app | BTB outflow = `BtbLc` + `BtbLcAccounting` where status <> REALIZED and LC not cancelled; date = accounting `maturity_date`, else `BtbLc.maturity_date`, else ESTIMATED (section 13 Q3); amount = `maturity_amount` else `amount` x `BtbLc.exchange_rate_to_base`. Tranches only split dates when rows exist; their status is never used. |
| 4 HIGH | Received / billed purchases vanish from cash | Outflows: (a) AP due via `resolve_finance_ar_ap_due_source` (open bills, amount - paid, at due date); (b) GRN accepted value without a posted vendor bill line, at GRN date + vendor terms; (c) unreceived PO value at expected date + terms. Test: one PO line open -> received -> billed -> paid is counted exactly once at each stage. |
| 5 HIGH | PO <-> BTB link exists (`PurchaseOrder.btb_lc_id`, `BtbLc.purchase_order_id`, GRN `btb_lc_id`); facilities link to BTB / PO | Dedupe order: a PO / GRN / bill linked to a BTB LC is paid only through the BTB maturity; a BTB LC (or its PO) with a linked facility utilization is paid only through that utilization's schedule after drawdown. Each source row counted once; test. |
| 6 HIGH | Inflows double counted (partial invoices, advances) | Remaining order inflow = revenue at completion - invoiced (sum of `CommercialInvoiceLine.line_amount` for the order on non-cancelled invoices) - posted proforma advances. Invoice outstanding batched with `ACTIVE_ALLOCATION_STATUSES` and the invoice's booked rate. Test partial invoice + advance. |
| 7 HIGH | Finance services cannot batch and belong to another team | No edits to `finance/**`. List endpoints use MI's own batched reads (procurement, invoices, budget per order); GL figures only via the single-order call to the public `build_entity_profit`. Budget per order computed in MI with the same rule as `_budget_and_counts` (quotation currency + stored `exchange_rate`), contract test asserting equality for one order. |
| 8 HIGH | Plan vs recorded decisions; doc 09 permission / flag names | Section 10 rewritten to the 2026-11-13 decisions (done); section 13 refines them. Two flags: `mfg_cost_intelligence_v1` (cost at completion) and `mfg_financial_readiness_v1` (cash requirement), both strict, default OFF, need `manufacturing_intelligence_v1`. |
| 9 HIGH | Hourly `good_qty` is per department; summing all multiplies progress | p = sewing-department hourly good quantity / order quantity, capped at 1; fallback plan `completed_qty`; missing => UNKNOWN; return `progress_source` and Phase 1 `produced_qty` side by side; multi-department test. |
| 10 HIGH | `require_internal_permission` is a no-op with RBAC off; finance profitability also needs `finance.mis_report.view` | Least privilege (section 13 Q5): money fields require, in the handler and in every RBAC mode, a role that is admin / manager or explicitly grants `finance.access` and `finance.mis_report.view`. Without it the cost / cash endpoints return 403; RBAC matrix test (off / shadow / enforce x strict on / off). |
| 11 MED | Quotation totals are for `projected_quantity`; a selling-price resolver exists | Revenue = order qty x `resolve_selling_unit_price` (snapshot -> PI -> quotation), source labelled; budget scaled by order qty / projected qty (reason `BUDGET_SCALED`); buying commission (`Order.commission_*`) shown as a deduction: net revenue = gross - commission. |
| 12 MED | FX lineage only defined for POs | Every row: source amount, currency, rate, rate source (PO header, invoice, BTB LC, facility utilization, quotation). Foreign without rate => UNKNOWN, excluded from totals, listed in `unknown_by_currency`. Float columns read via `Decimal(str())`. |
| 13 MED | Facility edge cases | Active utilizations only; partially paid line = emi - paid; bullet / one-time = maturity_date + outstanding principal + accrued interest; overdue in week 1. |
| 14 MED | Payroll period / runs | Newest finalised-or-later run per period, not yet paid: net pay and statutory deductions as two rows; future months repeat the last period, dated 7th working day after period end (tenant calendar). |
| 15 MED | Delivery prediction N+1 for inflows | Max 200 orders by delivery date use the Phase 1 prediction; the rest use `Order.delivery_date` (ESTIMATED); query-count test. |
| 16 MED | Truncation vs totals | Weekly totals from all rows; only the returned row list is truncated (2,000). |
| 17 MED | Financing gap ignores overdraft / headroom | Opening cash = `pool_balances_by_class` at `date_from`, shown with and without bank overdraft; the gap uses the figure **without** overdraft; facility headroom shown as a memo, never added to closing balance. |
| 18 MED | Invoice revenue lands on the first line's order | Invoiced revenue per order from invoice lines, never from GL revenue. |
| 19 LOW | New settings | `export_document_days`, `export_usance_days`, `btb_usance_days`, `cpm_override` in `mfg_planning_config` (JSON, no migration); PUT needs `production.planning.approve` and, for these money keys, the section 13 Q5 finance gate. |
| 20 LOW | Read-only sweep | New GETs (flags on) added to `_hit_every_endpoint`. |
| 21 LOW | Weeks / overdue | 7-day bins from `date_from`; overdue BTB / AP / receivables / instalments in week 1 labelled `OVERDUE`. |

## 13. Refined owner decisions (industry standard, 2026-11-13)

| # | Decision |
|---|---|
| Q1 Revenue | Contract value = order qty x resolved selling price (snapshot -> PI -> quotation); gross and net of buying commission both shown; margin uses net. |
| Q2 Realisation | Shipment / invoice date + `export_document_days` (7) + `export_usance_days` (90; 0 = at sight). Edited by a planning approver who also passes the finance gate. |
| Q3 BTB | Dedupe order of finding 5 confirmed. Opened BTB LC without accepted documents: ESTIMATED date = linked PO expected receipt date (else LC date) + `btb_usance_days` (default 120, common BTB usance), labelled `BTB_DATE_ESTIMATED`. |
| Q4 Payroll | Cash out = net pay + statutory deductions (both are cash), two rows, totals only; finance gate is enough because no per-person data is shown. |
| Q5 Visibility | Least privilege in every RBAC mode: admin / manager role or explicit `finance.access` + `finance.mis_report.view` grant; others see quantities and dates only. |
| Q6 Conversion | CPM = (direct labour + factory overhead posted in the trailing 3 closed months) / earned SAH minutes of the same months (sewing good output x SMV); a finance-approved `cpm_override` wins. Conversion EAC = order SAH x CPM, inside EAC; compared with budget CM as a variance. |
| Q7 Material | Material EAC = procured value + remaining budget (finding 2); budget = approved / frozen Order BOM cost when priced, else scaled quotation material. Replacement purchases for rejects count when ordered; short shipment reduces revenue only when the order is closed / fully invoiced. |
| Q8 Budget scaling | Yes: quotation budget x order qty / projected qty. |
| Q9 Opening cash | Gap test without bank overdraft; overdraft and facility headroom shown as available financing (memo), never as cash. |

## 14. Plan audit round 2 (REVISE; round-1 CRITICAL / HIGH all resolved) - binding resolutions

These **override** sections 12-13 where they differ.

| # | Finding | Binding resolution |
|---|---|---|
| N1 HIGH | AP + GRN-not-billed + unreceived PO can count one purchase three times: finance creates outstanding bills for a whole PO or one GRN, linked only by `notes` markers `PO:{code}` / `GRN:{code}` (`finance/router.py:4225-4375`); a posted `VendorBill` creates no outstanding bill under that source; party ledger links `PartyLedgerBill.vendor_bill_id` (`party_ledger.py:138`) | Billed set: party-ledger source = credit bills with `pending_amount > 0` joined via `vendor_bill_id` to the bill's `purchase_order_id` / `goods_receiving_id`; outstanding-bills source = PAYABLE bills (amount - paid), parse `PO:` / `GRN:` markers and resolve codes inside the tenant. A PO-marker bill removes that PO from (b) and (c); a GRN-marker bill or a posted vendor-bill line removes that GRN from (b). A posted `VendorBill` without an AP row (outstanding-bills source) counts at its `due_date`, labelled `PAYMENT_STATUS_UNKNOWN`. Foreign bill without rate = UNKNOWN. Test: PO bill + GRN + vendor bill + payment counted exactly once under each source. |
| N2 HIGH | No "direct labour / factory overhead" GL class; cost natures are MATERIAL / CM / OTHER / NON_OPERATING (`finance/statements/constants.py:6-25`, `models/finance.py:128,307`) | CPM numerator = tenant-wide POSTED, in-books, base-currency P&L lines that the public `bucket_of` (with `load_group_classification`) puts in the `cm` bucket, over the trailing 3 **locked** accounting periods; no order filter; no edits to `finance/**`. CPM UNKNOWN when cm total <= 0, earned SAH <= 0 or a period is not locked. Uncoded `DIRECT_EXPENSES` lines (bucket other) shown as warning `CPM_UNCODED_DIRECT_EXPENSES`. Earned SAH = sewing entries with `order_id`, same SMV source (`smv_resolver`) as order SAH. `cpm_override` still wins. |
| N3 HIGH | Price resolver reads quotation `quoted_price` (an order total) as a unit price and divides a multi-order PI by one order's qty (`commercial_invoice_service.py:84-106`, `quotations/router.py:1258-1332`) | Revenue chain: (1) snapshot `quoted_price` x qty (`SNAPSHOT_QUOTED`); (2) PI amount only when the PI links exactly one order (`PI_SINGLE_ORDER`), multi-order PI skipped with `PI_MULTI_ORDER`; (3) `Quotation.total_amount` x order qty / projected qty (`QUOTATION_TOTAL_SCALED`, same base as the budget). Never `quoted_price` as a unit price. PIs and quotations preloaded in one query each. Tests: multi-order PI, quotation-only order. |
| M1 | BOM budget has no rate, sized for snapshot qty (`models/merch.py:369-449`) | Approved / frozen BOM only; budget = sum `bom_expected_total_cost` (else `quoted_total_cost`) x order qty / `order_qty_at_approval` (else `order_qty_snapshot`); convert with the quotation `exchange_rate` only when `currency_snapshot` equals the quotation currency or base; else UNKNOWN and fall back to scaled quotation material. |
| M2 | Revenue FX for un-invoiced orders | Quotation `exchange_rate` when currencies match; else UNKNOWN (`unknown_by_currency`). |
| M3 | Advance netting | Remaining = max(0, revenue - invoiced - POSTED advances not yet applied to an invoice); a PI-level advance without order is spread over the PI's orders by quantity; clamp test. |
| M4 | BTB join / drafts | Outer join `BtbLc` -> `BtbLcAccounting`; exclude `BtbLc.status` CLOSED / CANCELLED and accounting REALIZED; a DRAFT BTB LC does not take over its PO (PO stays in PO / GRN outflows). |
| M5 | Payroll "unpaid" not detectable; `deduction_total` has non-cash items | Runs whose period `payment_date` >= `date_from`; earlier periods `ASSUMED_PAID`. Statutory row = only components with a statutory kind (e.g. `BD_TDS`), not the whole `deduction_total`. |
| M6 | PO status RECEIVED not proven | Read the PO status allowlist from code before building; fixtures cover each status (open = APPROVED / PARTIALLY_RECEIVED, closed = CLOSED, plus any received status that exists). |

Build follow-up decisions (owner, industry standard, 2026-11-13):
- Weekly balance and financing gap use **net cash** = cash + bank - drawn overdraft (treasury standard; a drawn
  overdraft reduces liquidity); undrawn limits / facility headroom stay a memo. Supersedes section 12 #17 / 13 Q9.
- Unapplied posted proforma advances are netted from the order's remaining inflow (floored at 0): the cautious choice
  for a cash forecast.
- Posted vendor bills of unknown payment status more than 90 days past due are stale ageing items: excluded from
  cash totals and counted in note `STALE_PAYABLES` for review in accounts payable.
- Receivables mirror payables: only ISSUED commercial invoices count as cash (DRAFT invoices never count, and are not
  subtracted from the order's remaining value either; CANCELLED never counts). An issued invoice more than 90 days
  past its expected realisation date (invoice date + document + usance days) is doubtful: excluded from cash totals
  and counted in note `STALE_RECEIVABLES`.
- Order inflow (`ORDER_REMAINING`) is net of buying commission (deducted from export proceeds):
  max(0, (gross contract value - issued invoices) x net/gross - unapplied posted advances), reason
  `NET_OF_BUYING_COMMISSION`. An advance whose receipt voucher is also allocated to an invoice of the same order is
  already inside that invoice and is not subtracted again.
- No silent truncation: every dedupe / skip rule runs in SQL before the per-source row cap, capped sources read
  newest first (date desc, id desc), and a source that hits its cap adds reason `SOURCE_TRUNCATED:<category>` and
  `forecast_complete: false`.
- Timing: anything due before `date_from` is shown in week 1 - `OVERDUE` when already past due today,
  `DUE_BEFORE_START` when it falls between today and a future `date_from` (payroll periods included: a period is
  assumed paid only when its payment date is before both today and `date_from`). `date_from` must be within 5 years
  of today; a stored date that would overflow the calendar gives an undated row (`DATE_OUT_OF_RANGE`).
- A PO / GRN / BTB LC linked to a facility utilization stays facility-funded (excluded from purchase rows) in every
  utilization status except draft / cancelled; only active utilizations produce repayment rows.

Audit gate: two correction rounds used (project limit). Implementers treat sections 12-14 as binding; the final diff
gets an independent security review before merge.
