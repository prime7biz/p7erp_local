# Finance module – current state (exploration 2026-11-12)

Exploration by Gemini 4 Carbon (read-only), spot-checked in `backend/app/modules/finance/router.py`.
Target reports: `REFERENCE_REPORTS.md` in this folder.

## 1. Frontend: 63 routes, 59 page components, 56 sidebar links

Routes: `frontend/src/app/AppProtectedRouter.tsx` (about lines 744 and 946–1014). Sidebar: `frontend/src/app/sidebarConfig.tsx`
(about lines 672–858), section "Finance" gated by `finance.access` (`components/shell/sidebarNavUtils.ts:25`).

| Sidebar subsection | Links | Pages (route under `/app/`) |
|---|---|---|
| Setup | 6 | `accounts/advance-options`, `accounts/groups`, `accounts` (CoA), `accounts/cost-centers`, `accounts/currency`, `accounts/accounting-periods` |
| Transactions | 20 | `accounts/vouchers`, `accounts/vouchers/print`, `accounts/vouchers/approval-queue`, `accounts/vouchers/:id`, `accounts/outstanding-bills`, `finance/voucher-types`, `accounts/vendor-bills`, `accounts/purchase-workflow`; flag-gated: party ledgers (`party_ledger_enabled`), tax ledgers / GST returns / tax settings (`gst_system_enabled`), voucher classes, recurring vouchers, post-dated + memorandum registers, credit / debit note, stock transfer voucher, TDS settings / reports |
| Banking | 6 | `banking/accounts`, `banking/reconciliation`, `banking/payment-runs`, `banking/payment-advice`, `banking/settlement-audit`, `finance/fx-receipts` |
| Reports | 15 | `accounts/reports/{day-book, trial-balance, financial-statements, cash-flow, ar-ap-aging, ledger-activity, exceptions, voucher-analytics, group-summary, ratio-analysis}`; `finance/mis{, /fund-flow, /ratios, /comparative, /cash-scenarios}` (hidden when `mis_reports_enabled` is false) |
| Planning | 6 | `accounts/budgets`, `finance/cash-forecast`, `cashflow/calendar`, `finance/style-profitability`, `finance/lc-profitability`, `finance/costing-variance` (one `ProfitabilityPage` with `defaultMode`) |
| Loans & facilities | 3 | `finance/facilities/dashboard`, `finance/facilities`, `finance/business-overview` (sidebar under `finance.access`, routes guarded by `facility.access`) |

Other: `accounts/vouchers/:voucherId/cheque` (cheque print), `procurement/requisitions{,/:id}` sit inside the finance route
guard although they are procurement. Adjacent pages outside finance: `merch/OrderProfitabilityPage.tsx`,
`commercial/LcPerformancePage.tsx`, `reports/ReportLcOutstandingPage.tsx`, `reports/ReportBtbMaturityPage.tsx`,
`production/ProductionCostsPage.tsx`, `inventory/mrp-idt/PostCostingPage.tsx`, `AllApprovalsPage.tsx`.

Duplicates: two ratio pages (`accounts/reports/ratio-analysis`, `finance/mis/ratios`), two cash-flow families, financial
statements vs comparative, three aging sources.

Headers: about 22 newer finance pages use `AppPageHeader` (already hides its `<h1>` when embedded); about 20 older ones
(`TrialBalancePage`, `DayBookPage`, `FinancialStatementsPage`, `GroupSummaryPage`, `RatioAnalysisPage`, `BudgetsPage`, ...)
render a raw `<h1>`. No finance page has a component test.

## 2. HR hub pattern (to reuse)

`frontend/src/components/hr/kit/hrHubs.ts` (hubs with `id`, `path`, `label`, `description`, `icon`, `audience`, `tabs[]`;
tab = `id`, `label`, `legacyPath`, `load()`, optional `requiresFeatureFlag` / `requiresAnyFeatureFlag`), `HrHubPage.tsx`
(lazy tab cache keyed `hubId:tabId`, `?tab=` with fallback to first visible tab, one header + tab bar,
`EmbeddedPageProvider` + `Suspense`), `HrLegacyRedirect.tsx` (old route -> hub `?tab=`, keeps query + hash),
`components/app/embeddedPage.ts` / `EmbeddedPageContext.tsx` (generic). Ctrl+K palette `Layout.tsx:72`
(`hrTabPaletteRoutes`), bottom nav `AppBottomNav.tsx:161`, Help `PageHelpButton.tsx:85` (`resolveHrHelpPath`).
Tests `hrHubs.test.ts` (parses the router source: every legacy route kept or redirected, 1:1 `legacyPath`, unique ids,
guard containment, sidebar count, palette, help), `HrHubPage.test.tsx`.
HR-specific parts: `audience: "self"` + ESS link check in `HrHubPage.tsx:34–68`, fallback `/app/hr` in `HrLegacyRedirect.tsx:11`.
Missing for finance: `hideWhenFeatureFlagFalse` on tabs (needed for `mis_reports_enabled`).

## 3. Backend

`backend/app/modules/finance/` – routers mounted under `/api/v1` (`main.py:359–366`): `router.py` (`/finance`),
`party_ledger_router.py`, `gst_tax_router.py`, `advanced_voucher_router.py`, `tds_router.py`, `mis_reports_router.py`
(`/finance/reports/*`, `/finance/cash-flow/*`), `exception_reports_router.py`, `voucher_entry_assist_router.py`.
Services include `posting_core.py` (`line_base_amount_sql`, `voucher_in_books_clause`), `fiscal_year.py`,
`system_coa_templates.py`, `mis_coa_helpers.py`, `fund_flow_service.py`, `ratio_analysis_service.py`,
`comparative_statement_service.py`, `enhanced_cash_flow_service.py`, `exception_reports_service.py`,
`budget_vs_actual_service.py`, `budget_enforcement_service.py`, `business_overview_*`, `health_score_service.py`,
`finance_ai_readonly_service.py`. Related: `facility/`, `commercial/lc_performance_*`, `commission/`, `compliance/bd_router.py`,
`inventory/stock_report_queries.py`, `services/inventory_gl_service.py`.

### Existing report endpoints (GET `/api/v1/...`)

GL reports use `Voucher.status == "POSTED"` + `voucher_in_books_clause()` and `line_base_amount_sql()` unless noted.
Existing report maths uses Python `float` (`router.py` ~3326, 3403) – new work must use `Decimal`.

| Endpoint | How it works today | Gap vs Tally |
|---|---|---|
| `/finance/reports/day-book` (`router.py:3105`) | non-cancelled vouchers in range; sums line `amount` (voucher currency) | uses `amount`, not base |
| `/finance/reports/trial-balance` (`router.py:3293`) | flat ledger list, closing Dr / Cr only, `basis=cumulative|fy` (`fy` rolls prior P&L into `P&L-BF`) | no group rows, no opening / period Dr / period Cr |
| `/finance/reports/financial-statements` (`router.py:3375`) | five nature totals (Asset, Liability, Equity, Income, Expense) | no lines, no Trading vs P&L, no closing stock, no two-sided BS |
| `/finance/reports/cash-flow-statement` (`router.py:3426`) | classifies cash by `is_bank_account` / `is_bank_group` / name contains cash/bank; operating / investing / financing | opening ignores prior posted movement; no monthly summary |
| `/finance/reports/ledger-activity` (`router.py:6949`) | one ledger, running balance | opening ignores prior movement; uses `amount` not base |
| `/finance/reports/fund-flow` (`mis_reports_router.py:58`) | sources / applications between two snapshots (`mis_coa_helpers.financial_snapshot`, name-substring heuristics) | not monthly working-capital table |
| `/finance/reports/ratio-analysis` (`mis_reports_router.py:78`) | 13 ratios from heuristics (COGS fallback = expense × 0.6) | no Principal Groups block, heuristic classification |
| `/finance/reports/comparative-balance-sheet`, `/comparative-pl` | snapshot Dec-31 year1 vs year2 | ignores fiscal-year start |
| `/finance/bills/aging`, `/finance/bill-references/report/aging`, `/finance/party-ledgers/aging-report` | three parallel aging sources | duplication |
| `/finance/budgets/{id}/vs-actual` (`router.py:4659`) | posted in-books base amounts by account / cost centre / month, signed by group nature | ok |
| `/finance/cost-centers/dashboard` (`router.py:4412`) | sums all lines per cost centre | **no POSTED / in-books filter, no date range, uses `amount`** |
| `/finance/profitability/{style,lc,variance}` (`router.py:5908–6001`) | style / LC = quotation only; variance = quotation vs debit lines where `Voucher.reference == order_code` | no real GL actuals, fragile string match |

## 4. Chart of accounts (`backend/app/models/finance.py`)

- `AccountGroup` (24–57): `nature` String(32) with seeded values `Asset | Liability | Equity | Income | Expense` (untyped in
 `AccountGroupBody`), `parent_group_id`, `affects_gross_profit` (Trading vs P&L), `is_bank_group`, `is_summary_group`,
 `allow_posting`, `reporting_code`, `system_code`.
- `ChartOfAccount` (87–135): `normal_balance` debit|credit, `account_type` posting|statistical|header, `is_bank_account`,
 `enable_bill_wise`, `cost_nature` MATERIAL|CM|OTHER|NON_OPERATING.
- Two coexisting group sets: `/finance/account-groups/seed` (`router.py:1672–1695`, 10 Tally-like top groups: CAPITAL,
 LOANS_LIABILITY, CURRENT_LIABILITIES, CURRENT_ASSETS, FIXED_ASSETS, INVESTMENTS, DIRECT_EXPENSES, INDIRECT_EXPENSES,
 DIRECT_INCOME, INDIRECT_INCOME) and `system_coa_templates.SYSTEM_ACCOUNT_GROUPS` (39 flat groups seeded at startup with
 `parent_group_id = NULL`: CASH_AND_BANK (bank group, holds cash too), TRADE_RECEIVABLES, INVENTORY_GROUP, TRADE_PAYABLES,
 SHORT_TERM_BORROWINGS (holds OD), LC_BTB_LIABILITIES, TERM_LOANS, RAW_MATERIAL_COGS, DIRECT_WAGES, FACTORY_OVERHEAD,
 ADMIN_EXPENSE, SELLING_DISTRIBUTION, FINANCE_COSTS, SALES_REVENUE, OTHER_INCOME, ...).
- Classification reliability: direct vs indirect = reliable (`affects_gross_profit`); cash vs bank vs OD = partial;
 current vs fixed vs investment, current liabilities vs loans, debtors vs creditors = **unreliable** (substring guesses in
 `mis_coa_helpers.py:136–145`). A canonical statement classification on groups is needed for deterministic Tally reports.

## 5. Vouchers (`models/finance.py:185–306`)

`Voucher`: `voucher_type` (PAYMENT, RECEIPT, JOURNAL, CONTRA, MJ, PJ, LCJ, CREDIT_NOTE, DEBIT_NOTE, STOCK_TRANSFER,
MEMORANDUM, OPTIONAL), `voucher_date`, `status` (DRAFT, SUBMITTED, CHECKED, RECOMMENDED, APPROVED, POSTED, REJECTED,
CANCELLED, REVERSED), `currency`, `base_currency` (BDT), `exchange_rate`, `fiscal_year`, `source_module`,
`source_module_ref`, reversal links, `include_in_books`, `is_post_dated`, `is_memorandum`, `is_optional`; header dimensions
`order_id`, `btb_lc_id`, `trade_case_id`, `mfg_work_order_id`, `facility_utilization_id`, `branch_code`.
**No `style_id` / `master_contract_id` on vouchers**; `master_contracts.cost_center_id` links an Export LC to a cost centre.
`VoucherLine`: `account_id`, `entry_type`, `amount`, `currency`, `exchange_rate`, `base_amount`, `cost_center_id`,
`cost_nature_override`. Period lock: `AccountingPeriod` (`models/finance.py:711–722`, `_assert_open_period` `router.py:1385`).
FY start: `tenants.feature_flags.fiscal_year_start_month` (default 1; BD companies often 7).

## 6. Closing stock

`inventory/stock_report_queries.py`: `stock_valuation_totals(..., as_of_date)` and `fifo_subquery` give historical FIFO
value at a date (falls back to `Item.default_cost`). `GET /inventory/stock-summary/by-group?as_of_date=` groups by
`StockGroup`. WIP: `GET /inventory/stock-summary/wip` (current only). No explicit RM / WIP / FG type on `Item`,
`ItemCategory` or `StockGroup`; `StockGroup.inventory_account_id` can point to `RAW_MATERIAL_INVENTORY`,
`PACKING_MATERIAL_INVENTORY`, `FINISHED_GOODS`. `stock_valuation_service.get_stock_value` is current-only.

## 7. Budget, AI, profitability, control

- Budget: `Budget` / `BudgetLine` (`models/finance.py:478–504`), budget vs actual service, enforcement (`budget_enforcement_mode`
 off|warn|block, `finance.budget_override`). No expense-claim or petty-cash module.
- AI: voucher entry assist + AI narration, `/finance/ai/readonly-insights` (`erp_ai_phases`), business overview AI narrative,
 `ai_tool/finance_forecast_service.py` (`ai.finance_forecast`), `generate_text_for_tenant` (OpenRouter first, tenant budget).
 `governed_ai/detectors.py` has no finance agents (only tna_delay, lc_expiry, bom_shortfall); one finance metric card.
- Profitability: merch `costing_variance_service.py` (`/orders/profitability-summary`) compares quotation/BOM vs actual
 PO/consumption; LC performance (`lc_performance_service.py`); exposure service. No real order / LC P&L from the GL.
- Control: vendor bill from GRN (`router.py:7599`, Dr GRNI / Cr AP) without price / qty tolerance check; commercial invoice
 limited to shipped qty; exception reports (GRN not billed, challan not invoiced, negative cash / stock, overdue bills).
 No landed-cost engine.

## 8. Permissions, flags, tests

- Keys (`backend/app/common/permissions.py:31–70, 149–153, 781–860`): `finance.access` (+ submodules), `facility.access`,
 `business_overview.access`, governance `finance.ap_posting_approve`, `finance.receipt_from_proforma`,
 `finance.budget_override`; soft keys `finance.mis_report.{view,export}`, `finance.scenario_analysis.view`, party ledger /
 tax / TDS / voucher keys; fail-closed `ai.finance_forecast`, `ai.tools.finance.read`.
- Flags (`tenant_feature_keys.py`): default ON `budget_enforcement_v2`, `mis_reports_enabled`, `voucher_entry_assist_enabled`,
 `ai_exception_agents_enabled`, `ai_dashboard_cards_enabled`, ...; default OFF party ledger, GST, TDS, voucher class,
 recurring, post-dated, memorandum, credit/debit note, stock transfer voucher, `direct_post_vouchers`.
- Frontend flag-gated finance routes are hidden in the sidebar only (backend returns 404).
- Backend tests: about 45 finance files (`test_mis_reports.py`, `test_perf_finance_reports_equivalence.py`,
 `test_budget_*`, `test_finance_*`, `test_voucher_*`, `test_accounting_*`, `test_inventory_accounting_*`, ...).
 Frontend: only lib/hook tests (`fiscalYear`, `money`, `fxRates`, `amountInWords`, `useVoucherHotkeys`, `workflowMeta`).
