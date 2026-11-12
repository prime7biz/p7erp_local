# Prime7 Finance Modernization Plan

Status: proposed architecture, revised after independent verification, not implementation  
Authors: exploration Gemini 4 Carbon, architecture GPT-5.6 Sol, verification Claude Opus 4.8 (`architect-premium`)  
Verification (2026-11-12): REVISE -> fixed in this file: perpetual COGS (no stock double count, `COGS` class),
Business Overview single tab, ledger-activity base currency for every row, cost-centre `Voucher` join,
cycle-safe group inheritance, TB P&L b/f = BS opening P&L, Bank OD three treatments documented, owner release gate.  
Modes: **CRITICAL** for statements, profitability, controls, classification and migrations; **ADVANCED** for navigation  
Reference target: `docs/finance-modernization/REFERENCE_REPORTS.md`  
Verified baseline: `docs/finance-modernization/CURRENT_STATE.md`, with targeted checks in the files cited below

## 1. Summary and operational impact

### Goal

Make Finance easier to navigate and more useful to an owner, CFO and accounts team:

1. Replace the current 56-link Finance sidebar with 10 clear hub links.
2. Add six Tally-style, drillable financial reports without changing existing report contracts.
3. Make profit, cash, working capital, budgets, expenses and exceptions the center of Finance.
4. Connect order, style and Export-LC profitability to posted GL actuals.
5. Add governed, read-only AI explanations only after deterministic reports are trusted.

### Non-goals

- Do not change voucher posting, approval, reversal, period-lock or inventory FIFO rules.
- Do not remove or rename existing routes or API fields.
- Do not merge duplicate report implementations until the new output has passed finance UAT.
- Do not move procurement requisitions out of the Finance route guard without separate approval.
- Do not add an expense-claim or petty-cash posting workflow in the core phases.
- Do not infer missing accounting classifications from account names in production reports.

### Evidence behind the design

- Finance currently has 56 sidebar links and its routes are concentrated under the
  `finance.access` guard (`frontend/src/app/sidebarConfig.tsx:672-857`,
  `frontend/src/app/AppProtectedRouter.tsx:946-1013`).
- Facility routes use `facility.access`, although their sidebar links are inside Finance
  (`frontend/src/app/AppProtectedRouter.tsx:1006-1013`).
- Procurement requisition routes currently sit inside the Finance guard
  (`frontend/src/app/AppProtectedRouter.tsx:993-994`).
- HR already proves the URL-tab, lazy-load, embedded-page, legacy-redirect, palette and Help pattern
  (`frontend/src/components/hr/kit/hrHubs.ts`,
  `HrHubPage.tsx`, `HrLegacyRedirect.tsx`).
- `AccountGroup` has broad `nature`, hierarchy and system metadata, but no deterministic statement class
  (`backend/app/models/finance.py:24-56`).
- Vouchers have tenant, date, status, dimensions and books controls; voucher lines have tenant,
  account, cost centre, base amount and entry type (`backend/app/models/finance.py:185-303`).
- Existing covering indexes are useful: vouchers `(tenant_id,status,voucher_date,id)` and voucher lines
  `(tenant_id,account_id,voucher_id)` including money columns
  (`backend/app/models/finance.py:187-197,277-288`).
- Report SQL must reuse `voucher_in_books_clause()` and `line_base_amount_sql()`
  (`backend/app/modules/finance/advanced_voucher_service.py:75-86`,
  `backend/app/modules/finance/posting_core.py:67-75`).
- Fiscal years already use the tenant's `fiscal_year_start_month`
  (`backend/app/modules/finance/fiscal_year.py:18-67`).
- Historical FIFO stock valuation already accepts an as-of date
  (`backend/app/modules/inventory/stock_report_queries.py:91-147,174-203`).

### Operational impact up front

| Item | Impact |
|---|---|
| New environment variables | None. |
| New tenant flags | `finance_hubs_v2`, `finance_statements_v2`, `finance_control_tower_v2`, `finance_budget_analytics_v2`, `finance_ai_insights_v2`; all default OFF and enabled only by strict `true`. |
| Database migrations | Two additive nullable columns: `account_groups.statement_class` and `stock_groups.stock_nature`; optional indexes only after `EXPLAIN ANALYZE`. |
| Downtime | None expected for nullable-column migrations. Apply through normal local-container verification and production release process. |
| Startup coordination | Backend restart after migration/code release; frontend release for hubs. No new secret. |
| Blast radius | Flags OFF preserve current routes, sidebar and reports. Existing endpoints and response shapes remain unchanged. |
| Rollback | Turn flags OFF first. Revert code. Downgrade nullable-column migrations only after confirming no dependent release remains. |
| Data safety | Reports are read-only. Classification edits use existing account-group authorization and audit logging. |

The plan must receive an independent `plan-auditor` verdict before implementation. Each CRITICAL final diff must also
receive the required `security-auditor-premium` review.

## 2. Target finance information architecture

### Hub-engine decision

Create a small generic hub engine in `frontend/src/components/app/hubs/`, then make Finance its first consumer.
Do **not** refactor HR onto it in this program.

Why:

- A Finance-only copy would duplicate URL, visibility, redirect, palette and Help logic.
- Refactoring HR at the same time would enlarge the blast radius and could break a working module.
- The generic engine can be contract-tested against Finance while all HR files and HR tests remain unchanged.
- A later, separately approved cleanup can migrate HR if the generic engine proves stable.

The generic tab schema supports:

- `id`, `label`, `legacyPath`, `load`.
- `requiresFeatureFlag` for strict-true flags.
- `hideWhenFeatureFlagFalse` for default-on flags such as `mis_reports_enabled`.
- `permissionKey` on hubs/tabs for navigation filtering only; route/API guards remain authoritative.
- Unknown or disabled tabs fall back to the first visible, permitted tab.
- Query parameters and hash survive old-route redirects.
- A tab can be marked `standalone` and omitted from embedding.

### Feature-flag behavior

- `finance_hubs_v2` is default OFF and must not be added to `DEFAULT_ON_FEATURE_FLAGS`.
- OFF: render the current Finance sidebar exactly as today; all current routes render current pages.
- ON: render the 10 hub links below; old list-page routes redirect to their hub tabs.
- Detail, create, cheque and print routes remain standalone in both modes.
- The router needs a flag-aware wrapper: when OFF it renders the current page; when ON it renders
  `FinanceLegacyRedirect`. This avoids breaking bookmarks before rollout.

### Final 10-link Finance sidebar

| Hub link | Hub route | Permission |
|---|---|---|
| Finance Home | `/app/finance/home` | `finance.access` |
| Vouchers & Payables | `/app/finance/vouchers-payables` | `finance.access` |
| Banking | `/app/finance/banking` | `finance.access` |
| Statements | `/app/finance/statements` | `finance.access` + report view |
| Reports & MIS | `/app/finance/reports` | `finance.access`; MIS tabs additionally use MIS view/flag |
| Budgets & Cash | `/app/finance/planning` | `finance.access` |
| Profitability | `/app/finance/profitability` | `finance.access` |
| Tax & Compliance | `/app/finance/tax-compliance` | `finance.access` |
| Loans & Facilities | `/app/finance/facilities-hub` | `facility.access` |
| Finance Setup | `/app/finance/setup` | `finance.access` |

For `finance_hubs_v2`, the Finance sidebar section is visible when the user has either `finance.access` or
`facility.access`. It shows only hubs whose permission is granted. This fixes the current misleading
Finance-link/facility-route mismatch without weakening any route guard.

### Exact tab map

The table accounts for every current Finance sidebar link. `legacyPath` is relative to `/app`.
Each `legacyPath` belongs to exactly one tab. Business Overview lives only in Loans & Facilities (its route guard is
`facility.access`); Finance Home may show a plain shortcut link to that tab, never a second embedded copy.

| Hub | Tab | `legacyPath` | Flag | Permission |
|---|---|---|---|---|
| Finance Home | Control Tower | new: `finance/home` | `finance_control_tower_v2` | `finance.access` |
| Vouchers & Payables | Vouchers | `accounts/vouchers` | none | `finance.access` |
| Vouchers & Payables | Approvals | `accounts/vouchers/approval-queue` | none | `finance.access` |
| Vouchers & Payables | Outstanding Bills | `accounts/outstanding-bills` | none | `finance.access` |
| Vouchers & Payables | Vendor Bills (GRN) | `accounts/vendor-bills` | none | `finance.access` |
| Vouchers & Payables | Purchase & AP | `accounts/purchase-workflow` | none | `finance.access` |
| Vouchers & Payables | Party Ledgers | `finance/party-ledgers` | `party_ledger_enabled` strict true | `finance.access` |
| Vouchers & Payables | Recurring Vouchers | `finance/recurring-vouchers` | `recurring_voucher_enabled` strict true | `finance.access` |
| Vouchers & Payables | Post-dated Register | `finance/registers/post-dated` | `post_dated_voucher_enabled` strict true | `finance.access` |
| Vouchers & Payables | Memorandum Register | `finance/registers/memorandum` | `memorandum_voucher_enabled` strict true | `finance.access` |
| Banking | Bank Accounts | `banking/accounts` | none | `finance.access` |
| Banking | Reconciliation | `banking/reconciliation` | none | `finance.access` |
| Banking | Payment Runs | `banking/payment-runs` | none | `finance.access` |
| Banking | Payment Advice | `banking/payment-advice` | none | `finance.access` |
| Banking | Settlement Audit | `banking/settlement-audit` | none | `finance.access` |
| Banking | FX Receipts | `finance/fx-receipts` | none | `finance.access` |
| Statements | Trial Balance | `accounts/reports/trial-balance` | new statement when `finance_statements_v2`; classic otherwise | `finance.mis_report.view` |
| Statements | Balance Sheet | `accounts/reports/financial-statements` | same staged replacement | `finance.mis_report.view` |
| Statements | Profit & Loss | new tab in `finance/statements` | `finance_statements_v2` | `finance.mis_report.view` |
| Statements | Cash Flow | `accounts/reports/cash-flow` | new statement when enabled; classic otherwise | `finance.mis_report.view` |
| Statements | Funds Flow | `finance/mis/fund-flow` | `finance_statements_v2`; also hide if `mis_reports_enabled` is explicitly false during coexistence | `finance.mis_report.view` |
| Statements | Ratio Analysis | `accounts/reports/ratio-analysis` | new statement when enabled; classic otherwise | `finance.mis_report.view` |
| Reports & MIS | Day Book | `accounts/reports/day-book` | none | `finance.access` |
| Reports & MIS | AR/AP Aging | `accounts/reports/ar-ap-aging` | none | `finance.access` |
| Reports & MIS | Ledger Activity | `accounts/reports/ledger-activity` | none | `finance.access` |
| Reports & MIS | Exceptions | `accounts/reports/exceptions` | none | `finance.access` |
| Reports & MIS | Voucher Analytics | `accounts/reports/voucher-analytics` | none | `finance.access` |
| Reports & MIS | Group Summary | `accounts/reports/group-summary` | none | `finance.access` |
| Reports & MIS | Financial MIS | `finance/mis` | hide when `mis_reports_enabled === false` | `finance.mis_report.view` |
| Reports & MIS | MIS Ratios (classic) | `finance/mis/ratios` | hide when `mis_reports_enabled === false` | `finance.mis_report.view` |
| Reports & MIS | Comparative | `finance/mis/comparative` | hide when `mis_reports_enabled === false` | `finance.mis_report.view` |
| Reports & MIS | Cash Scenarios | `finance/mis/cash-scenarios` | hide when `mis_reports_enabled === false` | `finance.scenario_analysis.view` |
| Budgets & Cash | Budgets | `accounts/budgets` | none | `finance.access` |
| Budgets & Cash | Cash Forecast | `finance/cash-forecast` | none | `finance.access` |
| Budgets & Cash | Cashflow Calendar | `cashflow/calendar` | none | `finance.access` |
| Profitability | Style Profitability | `finance/style-profitability` | none | `finance.access` |
| Profitability | LC Profitability | `finance/lc-profitability` | none | `finance.access` |
| Profitability | Costing Variance | `finance/costing-variance` | none | `finance.access` |
| Tax & Compliance | Tax Ledgers | `finance/tax-ledgers` | `gst_system_enabled` strict true | `finance.access` |
| Tax & Compliance | GST Returns | `finance/gst/returns` | `gst_system_enabled` strict true | `finance.access` |
| Tax & Compliance | Tax Settings | `finance/gst/settings` | `gst_system_enabled` strict true | `finance.access` |
| Tax & Compliance | TDS Settings | `finance/tds` | `tds_system_enabled` strict true | `finance.access` |
| Tax & Compliance | TDS Reports | `finance/tds/reports` | `tds_system_enabled` strict true | `finance.access` |
| Loans & Facilities | Dashboard | `finance/facilities/dashboard` | none | `facility.access` |
| Loans & Facilities | All Facilities | `finance/facilities` | none | `facility.access` |
| Loans & Facilities | Business Overview | `finance/business-overview` | none | `facility.access` |
| Finance Setup | Advance Options | `accounts/advance-options` | none | `finance.access` |
| Finance Setup | Account Groups | `accounts/groups` | none | `finance.access` |
| Finance Setup | Chart of Accounts | `accounts` | none | `finance.access` |
| Finance Setup | Cost Centres | `accounts/cost-centers` | none | `finance.access` |
| Finance Setup | Multi-Currency | `accounts/currency` | none | `finance.access` |
| Finance Setup | Accounting Periods | `accounts/accounting-periods` | none | `finance.access` |
| Finance Setup | Voucher Types | `finance/voucher-types` | none | `finance.access` |
| Finance Setup | Voucher Classes | `finance/voucher-classes` | `voucher_class_enabled` strict true | `finance.access` |

### Standalone routes and quick actions

These remain registered as normal routes and are not rendered inside tabs:

| Route | Reason |
|---|---|
| `accounts/vouchers/:voucherId` | Voucher detail and workflow deep links |
| `accounts/vouchers/print` | Print workspace |
| `accounts/vouchers/:voucherId/cheque` | Cheque print route outside the shell |
| `finance/party-ledgers/new` | Create form |
| `finance/party-ledgers/:id` | Party-ledger detail |
| `finance/credit-notes/new` | Create form; quick action in Vouchers hub; flag `credit_debit_note_enabled` |
| `finance/debit-notes/new` | Create form; quick action in Vouchers hub; flag `credit_debit_note_enabled` |
| `finance/stock-transfer-vouchers/new` | Create form; quick action; flag `stock_transfer_voucher_enabled` |
| `finance/facilities/new` | Create form under `facility.access` |
| `finance/facilities/:facilityId` | Facility detail |
| `finance/facilities/:facilityId/utilizations/new` | Create form |
| `finance/utilizations/:utilizationId` | Utilization detail |

Voucher Print is removed as a sidebar tab and becomes a clearly labelled action from the Vouchers page.
Create Credit Note, Debit Note and Stock Transfer become permission/flag-aware quick actions. Their URLs stay unchanged.

`procurement/requisitions` and `procurement/requisitions/:requisitionId` remain exactly where they are for now.
They are not Finance hub tabs because they are not Finance sidebar entries. A separate authorization review must decide
whether to move them to `procurement.access`; changing that now could grant or remove access.

### Duplicate-page policy

- Ratio pages: the new deterministic Ratio Analysis becomes canonical only after UAT. Both old routes remain and
  redirect to the canonical tab only when `finance_statements_v2` is enabled. The MIS implementation stays callable
  during one release for comparison, then receives a deprecation notice.
- Cash-flow families: do not merge forecasting/scenario pages with the accounting statement. The monthly historical
  statement is canonical for actual cash; forecast, calendar and scenario pages remain planning tools.
- Existing `financial-statements`, flat trial balance, MIS funds flow and ratios stay unchanged until acceptance.
- Deprecation sequence: side-by-side comparison -> signed UAT -> old UI marked “Classic” -> telemetry/release interval
  -> separate removal proposal. No endpoint deletion in this plan.

### Embedded-page and shell integration

- Pages using raw `<h1>` must call `useEmbeddedPage()` and hide only their screen title/duplicate description when
  embedded; print headers remain visible. Confirmed examples include `DayBookPage.tsx:122-133`,
  `TrialBalancePage.tsx:97-106`, `FinancialStatementsPage.tsx:106-114`,
  `GroupSummaryPage.tsx:85-93`, `RatioAnalysisPage.tsx:196-205`, `BudgetsPage.tsx:173-176`.
- Pages already using `AppPageHeader` need no title rewrite because that component supports embedding.
- Ctrl+K includes every visible Finance tab, not only the 10 hubs.
- `mobile_ui_v2`: Finance remains a bottom-nav candidate; its More drawer shows the same 10 filtered hub links and
  search includes visible Finance tabs. Mobile code already picks Finance as a module candidate
  (`frontend/src/app/sidebarConfig.tsx:1009-1013`).
- Help resolves `/app/finance/<hub>?tab=x` back to the tab's `legacyPath`, just as HR does.
- Tutorials for Finance navigation and changed workflows must be updated in the implementation PR.

## 3. Proposed directory structure

Only files relevant to this program are shown. Exact migration revision numbers are assigned at implementation time.

```text
backend/
  alembic/versions/
    <rev>_account_group_statement_class.py
    <rev>_stock_group_stock_nature.py
  app/
    common/
      permissions.py                         # reuse/register report and AI keys
      tenant_feature_keys.py                 # default-OFF strict flags
    models/
      finance.py                             # AccountGroup.statement_class
      inventory.py                           # StockGroup.stock_nature
    modules/
      finance/
        statements/
          __init__.py
          constants.py                       # allowlists, display order, formulas
          schemas.py                         # decimal-string contracts
          classification_service.py
          ledger_aggregate_service.py        # bounded shared SQL aggregation
          stock_service.py                   # historical RM/WIP/FG values
          trial_balance_service.py
          balance_sheet_service.py
          profit_loss_service.py
          cash_flow_service.py
          funds_flow_service.py
          ratio_service.py
          drilldown_service.py
          export_service.py
          router.py
        control_tower_service.py
        profitability_actuals_service.py
        expense_analysis_service.py
        finance_ai_commentary_service.py
      governed_ai/
        detectors.py                         # finance exception detectors
        metrics.py                           # finance cards
        router.py                            # existing human-confirm framework
  tests/
    test_finance_hubs_permissions.py
    test_finance_statement_classification.py
    test_finance_statements.py
    test_finance_statement_query_counts.py
    test_finance_statement_exports.py
    test_finance_stock_gl_reconciliation.py
    test_finance_profitability_actuals.py
    test_finance_control_tower.py
    test_finance_budget_expense_analytics.py
    test_finance_ai_commentary.py
    test_route_permission_inventory.py       # extend

frontend/
  src/
    api/
      financeStatements.ts
      financeControl.ts
    components/
      app/hubs/
        types.ts
        HubPage.tsx
        HubLegacyRedirect.tsx
        hubVisibility.ts
        hubNavigation.ts
      finance/
        hubs/
          financeHubs.ts
          FinanceHubPage.tsx
          FinanceLegacyRoute.tsx
        statements/
          StatementHeader.tsx
          StatementTable.tsx
          StatementDrilldown.tsx
          StatementExportMenu.tsx
        control/
          ExceptionCard.tsx
          ReconciliationCard.tsx
    pages/app/finance/
      FinanceControlTowerPage.tsx
      FinanceStatementsPage.tsx
      FinanceBudgetAnalyticsPage.tsx
      FinanceExpenseAnalysisPage.tsx
    app/
      AppProtectedRouter.tsx
      sidebarConfig.tsx
    components/
      Layout.tsx
      navigation/AppBottomNav.tsx
      shell/PageHelpButton.tsx
  src/components/app/hubs/
    hubVisibility.test.ts
    HubPage.test.tsx
  src/components/finance/hubs/
    financeHubs.test.ts
  src/pages/app/finance/
    FinanceStatementsPage.test.tsx
    FinanceControlTowerPage.test.tsx

docs/
  finance-modernization/
    PLAN.md
  ...matching tutorial section files and generated visuals...
```

## 4. Phased implementation

### Phase 0 — Safety baseline and known defect fixes

Size: **M**  
Flag: no new UI flag for corrected calculations; changes are small, additive tests first.

#### Scope

1. Capture golden fixtures for posted, excluded, optional, post-dated and reversed vouchers.
2. Fix cost-centre dashboard actuals to use:
   - tenant filter;
   - `Voucher.status == "POSTED"`;
   - `voucher_in_books_clause()`;
   - date range;
   - `line_base_amount_sql()`.
   The current query (`router.py:4430-4457`) does not join `Voucher`, so the fix adds that join. It returns floats
   rounded to 2 today (`router.py:4461-4472`); keep the float type unless the frontend consumer is updated in the
   same change.
3. Fix ledger-activity opening balance to include account opening balance plus all posted in-books base-currency
   movements before `from_date`, and compute **every period row** from `base_amount` too (today rows use voucher-currency
   `line.amount`, `router.py:6981-6985`). Keep the response key `amount`; document the corrected meaning (base
   currency) under 0.6, or add a new `base_amount` field — never change the number's meaning silently.
4. Fix classic cash-flow opening to include all prior posted in-books cash movements.
5. Do not change response field names. If date inputs are new, make them optional with the current effective period
   as the compatibility default.

#### Main files

- `backend/app/modules/finance/router.py`
- `backend/tests/test_finance_reports.py` or focused new defect test files
- Existing frontend pages only if optional date controls are exposed

#### Existing API compatibility

No endpoint is renamed. Corrected endpoints preserve current response JSON. Additive optional query parameters:

```text
GET /api/v1/finance/cost-centers/dashboard?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
GET /api/v1/finance/reports/ledger-activity?account_id=...&from_date=...&to_date=...
GET /api/v1/finance/reports/cash-flow-statement?from_date=...&to_date=...
```

Validation: `from_date <= to_date`; reject invalid dates with 422.

#### Acceptance criteria

0.1 Cost-centre actuals exclude DRAFT, SUBMITTED, CANCELLED, memorandum and out-of-books optional vouchers.  
0.2 Cost-centre actuals use base amount and return exact decimal strings where the existing schema permits.  
0.3 Ledger opening includes prior movement and the final running balance equals the as-of ledger balance.  
0.4 Cash opening plus period net equals closing cash balance.  
0.5 Another tenant's vouchers never affect any total.  
0.6 Existing endpoint keys remain byte-for-byte compatible apart from corrected values.  
0.7 Focused query-count tests prove no per-ledger SQL loop.

#### Regression tests

- Cross-tenant exclusion.
- Permission denial through route inventory.
- Invalid period.
- Foreign-currency base amount.
- Excluded voucher types.
- Fiscal-year boundary and a period beginning mid-year.

#### Rollback

Revert the focused calculation commit. No migration. Keep golden tests to identify the old defect if rollback is forced.

### Phase 1 — Finance hubs and navigation compaction

Size: **L**  
Flag: `finance_hubs_v2`, default OFF, strict true.

#### Scope

1. Build the generic hub primitives without touching HR.
2. Add the 10 Finance hubs and exact map from section 2.
3. Add flag-aware old-route handling that preserves query and hash.
4. Hide duplicate headings through `useEmbeddedPage`.
5. Wire sidebar fallback, Ctrl+K, mobile More/search and Help resolution.
6. Keep detail, print and create routes standalone.
7. Update Finance tutorials, navigation screenshots and `lastUpdated`.

#### Main files

- `frontend/src/components/app/hubs/*`
- `frontend/src/components/finance/hubs/*`
- `frontend/src/app/AppProtectedRouter.tsx`
- `frontend/src/app/sidebarConfig.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/navigation/AppBottomNav.tsx`
- `frontend/src/components/shell/PageHelpButton.tsx`
- Raw-header Finance page components
- Matching tutorial data/assets

#### Frontend contract

```ts
type HubTab = {
  id: string;
  label: string;
  legacyPath: string;
  load: () => Promise<{ default: React.ComponentType }>;
  requiresFeatureFlag?: string;
  hideWhenFeatureFlagFalse?: string;
  permissionKey?: string;
};
```

`financeHubHref(hub, tab)` returns `/app/<hub.path>?tab=<tab.id>`.
Old route query parameters remain and `tab` is replaced; hash remains.

#### Acceptance criteria

1.1 Flag OFF gives the current 56-link Finance sidebar and current route rendering.  
1.2 Flag ON gives exactly 10 Finance links, filtered by permissions.  
1.3 Every embeddable legacy route has exactly one hub/tab target.  
1.4 Every old bookmark preserves query and hash and opens the correct tab.  
1.5 Unknown, disabled or unauthorized tabs fall back without exposing content.  
1.6 `mis_reports_enabled === false` hides all five classic MIS tabs that currently use that rule.  
1.7 A user with `finance.access` but not `facility.access` cannot see/open facility tabs; the reverse user can see
the Facilities hub but no other Finance hub.  
1.8 Raw page titles do not duplicate hub titles; print titles remain.  
1.9 Ctrl+K, mobile More search and Help resolve all visible tabs.  
1.10 Voucher detail, cheque, print, party detail, facility detail and create forms remain standalone.  
1.11 Procurement requisition guards are unchanged.  
1.12 Existing `hrHubs.test.ts` and `HrHubPage.test.tsx` remain green without HR changes.

#### Regression tests

- `financeHubs.test.ts` parses router/sidebar and proves 1:1 legacy mapping, unique IDs, guard containment and count.
- Generic hub visibility tests cover strict-on and default-on-hide flag semantics.
- Redirect test covers query/hash and flag OFF/ON.
- Palette, Help and mobile search tests.
- Existing route guard and HR tests.

#### Rollback

Set `finance_hubs_v2=false`; old sidebar/pages return immediately. Revert frontend changes later. No database change.

### Phase 2 — Canonical classification and Tally-style statements

Size: **XL**, delivered as several reviewable PRs  
Flag: `finance_statements_v2`, default OFF, strict true.

#### 2A. Canonical account classification

Add nullable `account_groups.statement_class VARCHAR(40)`.
Use an application allowlist rather than a PostgreSQL enum so additions and downgrade remain safer.

Allowlisted leaf classes:

```text
CAPITAL_ACCOUNT
LONG_TERM_LOANS
SHORT_TERM_BORROWINGS
BANK_OD
CURRENT_LIABILITIES
SUNDRY_CREDITORS
FIXED_ASSETS
INVESTMENTS
CURRENT_ASSETS
SUNDRY_DEBTORS
CASH_IN_HAND
BANK_ACCOUNTS
STOCK_IN_HAND
SALES_ACCOUNTS
PURCHASE_ACCOUNTS
DIRECT_INCOMES
DIRECT_EXPENSES
INDIRECT_INCOMES
INDIRECT_EXPENSES
COGS
```

`COGS` holds the cost-of-goods-sold / consumption ledgers that perpetual inventory posting debits; it rolls into the
debit side of the Trading account.

Report rollups map leaf classes to the Tally primary groups in `REFERENCE_REPORTS.md`.
For example, `BANK_OD` rolls into Loans (Liability), while `CASH_IN_HAND`, `BANK_ACCOUNTS`,
`SUNDRY_DEBTORS` and `STOCK_IN_HAND` roll into Current Assets.

Rules:

- A group's explicit class applies to all descendants unless a descendant overrides it.
- Resolve inheritance with one recursive CTE, tenant-filtered, with a cycle guard (depth cap or visited set):
  `parent_group_id` is a self-reference with no database protection against loops (`models/finance.py:35-37`).
  The setup endpoint rejects a parent assignment that would create a cycle; add a regression test for a
  self-parent / cyclic group.
- Backfill only deterministic `system_code` mappings.
- Leave ambiguous groups NULL.
- Reports show NULL as **Unclassified** with drill-down; they never guess from names.
- Account Groups setup exposes a controlled select and a preview of affected ledgers/reports.
- Updating classification uses the existing Account Groups authorization plus `log_action`.
- Existing `nature` and `affects_gross_profit` remain; no posting behavior changes.

Migration A:

1. Add nullable `statement_class`.
2. Add a check constraint for the allowlist, preferably `NOT VALID`, validate after backfill.
3. Backfill deterministic system codes only.
4. Add `(tenant_id, statement_class)` index only if plans show it is useful; group-table size may make it unnecessary.
5. Downgrade drops the check/index/column.
6. This is an existing tenant table, so no new RLS policy is needed; `tests/test_rls_policies.py` still runs.
7. Do not make the column NOT NULL. Unclassified is an intentional safe state.

#### 2B. Canonical stock nature

Choose a new nullable `stock_groups.stock_nature VARCHAR(16)` rather than relying permanently on
`inventory_account_id -> account.system_code`.

Allowlist: `RAW_MATERIAL`, `WORK_IN_PROCESS`, `FINISHED_GOODS`, `OTHER`.

Reason: a stock group can share/fallback to an inventory account, and account mappings are not a reliable business
statement of RM/WIP/FG. The explicit stock nature is understandable and editable.

Rules:

- Explicit class inherits down the StockGroup tree unless overridden.
- Deterministic backfill may use mapped account system codes for RM and FG; WIP maps from `wip_account_id`.
- Ambiguous stock remains `OTHER` or NULL according to the user's answer; it is separately disclosed.
- Historical valuation continues to use `fifo_subquery`/`stock_valuation_totals`; classification changes display only.

Migration B is nullable, reversible and on an existing RLS-covered table; no new policy is needed.

#### 2C. Shared statement calculation rules

Every statement query:

- resolves `tenant` with `require_tenant`;
- filters both voucher and line tenant where practical;
- includes only `Voucher.status == "POSTED"` and `voucher_in_books_clause()`;
- uses `line_base_amount_sql()` and `Decimal`;
- returns money as 4-decimal strings, never floats;
- derives FY start/end from `fiscal_year.py`;
- includes `ChartOfAccount.opening_balance` plus all qualifying prior movement for opening balances;
- aggregates in SQL by account/group/month and never runs a query per ledger;
- returns an `unclassified` warning/count/amount;
- returns `data_as_of`, base currency, period and reconciliation metadata.

Recommended query budgets, enforced in tests:

| Operation | Maximum SQL statements |
|---|---:|
| Trial Balance | 6 |
| Balance Sheet | 8 including stock |
| Profit & Loss | 8 including opening/closing stock |
| Monthly Cash Flow | 5 |
| Monthly Funds Flow | 6 |
| Ratio Analysis | 10 including aging |
| One drill-down level | 5 |

#### New additive API contracts

All routes are under `/api/v1/finance/statements` and require `finance.access` plus
`finance.mis_report.view`. Export additionally requires `finance.mis_report.export`.
Missing soft keys preserve the existing permission convention; explicit false denies.

Common query:

```text
from_date=YYYY-MM-DD
to_date=YYYY-MM-DD
as_of_date=YYYY-MM-DD
fiscal_year=2026
include_zero=false
```

Use only the parameters relevant to each route. Reject conflicting period inputs with 422.
Default is the current tenant fiscal year through today.

Common envelope:

```json
{
  "report": "trial_balance",
  "company": {"name": "...", "address": "...", "email": "..."},
  "period": {"from_date": "2026-07-01", "to_date": "2027-06-30", "fiscal_year": "2026-27"},
  "base_currency": "BDT",
  "rows": [],
  "totals": {},
  "warnings": [{"code": "UNCLASSIFIED_GROUPS", "count": 2, "amount": "100.0000"}],
  "reconciliation": {"balanced": true, "difference": "0.0000"},
  "data_as_of": "2026-11-12T..."
}
```

##### Grouped Trial Balance

```text
GET /api/v1/finance/statements/trial-balance?from_date=...&to_date=...&include_zero=false
```

Row:

```json
{
  "row_type": "group",
  "id": 10,
  "parent_id": null,
  "name": "Current Assets",
  "depth": 0,
  "opening_debit": "0.0000",
  "opening_credit": "0.0000",
  "period_debit": "125.0000",
  "period_credit": "25.0000",
  "closing_debit": "100.0000",
  "closing_credit": "0.0000",
  "dr_cr": "Dr",
  "drilldown": {"kind": "group", "id": 10}
}
```

Rows contain Tally primary groups, nested groups and ledgers, plus a synthetic `PROFIT_AND_LOSS_ACCOUNT` line for
accumulated pre-FY profit/loss. Grand debit equals grand credit.

##### Two-sided Balance Sheet

```text
GET /api/v1/finance/statements/balance-sheet?as_of_date=...
```

```json
{
  "liabilities": [{"name": "Current Liabilities", "inner_amount": null, "outer_amount": "500.0000", "children": []}],
  "assets": [{"name": "Current Assets", "inner_amount": null, "outer_amount": "500.0000", "children": []}],
  "profit_and_loss": {"opening": "50.0000", "current_period": "-10.0000", "side": "assets"},
  "totals": {"liabilities": "500.0000", "assets": "500.0000", "difference": "0.0000"}
}
```

Positive retained profit appears on liabilities/equity; accumulated loss appears on assets, matching the reference.

##### Trading + Profit & Loss A/c

```text
GET /api/v1/finance/statements/profit-loss?from_date=...&to_date=...
```

```json
{
  "trading": {
    "debit_rows": [],
    "credit_rows": [],
    "opening_stock": {"raw_material": "0.0000", "work_in_process": "0.0000", "finished_goods": "0.0000"},
    "closing_stock": {"raw_material": "0.0000", "work_in_process": "0.0000", "finished_goods": "0.0000"},
    "gross_result": {"kind": "profit", "amount": "0.0000"},
    "debit_total": "0.0000",
    "credit_total": "0.0000"
  },
  "profit_and_loss": {
    "debit_rows": [],
    "credit_rows": [],
    "gross_brought_forward": {"kind": "profit", "amount": "0.0000"},
    "nett_result": {"kind": "profit", "amount": "0.0000"},
    "debit_total": "0.0000",
    "credit_total": "0.0000"
  }
}
```

**Inventory policy (verified in code, not an open question):** P7 posts perpetual inventory. GRN posts
Dr Inventory / Cr GRNI (`services/inventory_gl_service.py:240-266`), delivery challans and consumption issues post
Dr COGS / Cr Inventory (`inventory_gl_service.py:305-327, 687-705`), wired in `modules/inventory/router.py`
(about lines 3515, 4530, 4974, 6000). Purchases are therefore mostly capitalised, not expensed.

So the Trading and P&L figures come **only from classified GL movement** (COGS flows through the `COGS` class).
The Balance Sheet stock figure is the GL inventory ledger balance (`STOCK_IN_HAND` class), so the sheet balances.
FIFO stock is used only as (a) a memo comparison beside that figure and (b) the stock-vs-GL control. It is **not**
added as an extra opening/closing-stock adjustment on top of GL COGS, which would count stock twice.
`opening_stock` / `closing_stock` in the response are disclosure-only memo figures (FIFO at `from_date - 1` and
`to_date`), clearly labelled, and excluded from `gross_result`.

For tenants that imported Tally-style periodic balances (purchases expensed, stock never posted), the same fixture
must compute both the pure-GL result and the periodic result (opening + purchases − closing) and show the
difference as a disclosed stock adjustment line. Release is blocked until a tenant with perpetual postings passes
acceptance 2.6.

##### Monthly Cash Flow

```text
GET /api/v1/finance/statements/cash-flow-monthly?fiscal_year=2026
```

```json
{
  "opening_cash": "100.0000",
  "months": [
    {"month": "2026-07", "label": "Jul 2026", "inflow": "50.0000", "outflow": "25.0000", "nett_flow": "25.0000",
     "closing_cash": "125.0000", "drilldown": {"kind": "month", "value": "2026-07"}}
  ],
  "grand_total": {"inflow": "50.0000", "outflow": "25.0000", "nett_flow": "25.0000", "closing_cash": "125.0000"}
}
```

Cash pool = `CASH_IN_HAND + BANK_ACCOUNTS + BANK_OD`, with signed debit-minus-credit movement.

##### Monthly Funds Flow

```text
GET /api/v1/finance/statements/funds-flow-monthly?fiscal_year=2026
```

```json
{
  "months": [
    {"month": "2026-07", "working_capital_opening": "100.0000",
     "working_capital_closing": "120.0000", "funds_flow": "20.0000"}
  ],
  "grand_total": {"working_capital_opening": "100.0000",
                  "working_capital_closing": "120.0000", "funds_flow": "20.0000"}
}
```

Working capital = classified Current Assets minus classified Current Liabilities at each month boundary.

##### Ratio Analysis

```text
GET /api/v1/finance/statements/ratio-analysis?from_date=...&to_date=...&as_of_date=...
```

```json
{
  "principal_groups": [
    {"code": "WORKING_CAPITAL", "label": "Working Capital", "amount": "100.0000", "dr_cr": "Dr"},
    {"code": "WORKING_CAPITAL_TURNOVER", "label": "Working Capital Turnover", "value": "2.5000", "unit": "times"}
  ],
  "principal_ratios": [
    {"code": "CURRENT_RATIO", "label": "Current Ratio", "numerator": "200.0000",
     "denominator": "100.0000", "value": "2.0000", "display": "2.00 : 1"}
  ]
}
```

Return every Principal Group and Principal Ratio listed in `REFERENCE_REPORTS.md`. A zero denominator returns
`value: null`, `display: "N/A"` and a warning; never substitute a fabricated value.
“Due till today” uses bill-wise due dates from the accepted AR/AP source.

##### Drill-down

```text
GET /api/v1/finance/statements/drilldown?report=cash_flow&level=group&from_date=...&to_date=...&group_id=...
```

Allowlisted `report` and `level`: `month -> group -> ledger -> voucher`.
Reuse the corrected ledger-activity/day-book query builders at the last two levels.
IDs are tenant-validated; another tenant's ID returns the same 404 as missing.
All list levels use bounded `limit <= MAX_PAGE_SIZE` and `offset`.

##### Export

```text
GET /api/v1/finance/statements/{report}/export?format=pdf|xlsx&...
```

- Server-generated PDF and XLSX use the same computed payload, not separate math.
- Print view, PDF and Excel include company header, period, page continuation, carried/brought forward,
  South-Asian lakh/crore grouping and Dr/Cr suffixes.
- CSV is optional; XLSX is required.
- Frontend downloads through `saveBlob`/`openOrSaveBlob`.

#### Statement acceptance criteria

2.1 Every report excludes other tenants and non-posted/out-of-books vouchers.  
2.2 Money remains exact at 4 decimals through SQL, Python, JSON and export.  
2.3 TB opening includes all prior posted movement and TB grand debit equals grand credit.  
2.4 BS liabilities/equity plus retained profit equals assets plus accumulated loss; difference is zero.  
2.5 Trading totals balance after gross result; P&L totals balance after nett result.  
2.6 P&L nett equals classified TB income/expense movement (GL only, perpetual COGS included once). On a fixture with
both perpetual postings and a periodic comparison, the pure-GL result and the periodic result reconcile exactly through
the disclosed stock adjustment, and memo opening/closing stock never enters `gross_result`.  
2.6a The TB synthetic P&L brought-forward line equals the Balance Sheet opening P&L for the same as-of date.  
2.7 Cash monthly nett equals cash-pool closing minus opening for every month and year total.  
2.8 Funds flow equals monthly change in working capital and year closing minus opening.  
2.9 Ratios match independently calculated fixtures; zero denominators return N/A.  
2.10 Unclassified groups/stock are visible and never silently guessed.  
2.11 Fiscal years starting January and July produce correct 12-month order and boundaries.  
2.12 Drill-down totals equal the clicked parent at every level.  
2.13 Query counts remain within the budgets above on a large fixture.  
2.14 Permission view denial blocks JSON/HTML; export denial blocks PDF/XLSX.  
2.15 Cross-tenant group/account IDs appear missing.  
2.16 Existing report endpoint response shapes and tests remain unchanged.  
2.17 PDF/XLSX totals equal JSON totals and use lakh/crore + Dr/Cr formatting.  
2.18 Classification changes are audited and cannot change another tenant's groups.

#### Rollback

Set `finance_statements_v2=false`; classic reports remain. Revert services/routes. The nullable columns can remain
harmlessly or be downgraded after code rollback. No voucher or stock data is rewritten.

### Phase 3 — Finance Control Tower and real profitability

Size: **XL**  
Flag: `finance_control_tower_v2`, default OFF, strict true.

#### Scope

Create a read-only Finance home focused on exceptions and real GL outcomes:

- GRN received but not vendor-billed.
- Delivery challan shipped but not invoiced.
- Vendor bill quantity/price variance versus PO/GRN, using user-approved tolerance.
- Negative cash and negative stock.
- Overdue AR/AP.
- Budget breaches.
- Stock valuation versus GL inventory ledger mismatch.
- Unposted vouchers and vouchers pending approval.

Create profitability views:

- Order P&L.
- Style rollup of order P&Ls.
- Export-LC/Master Contract P&L.
- Buyer profitability.
- Actual versus quotation/BOM budget.

#### Attribution design

Use only explicit links:

1. Voucher `order_id` is direct order actual.
2. Voucher-line `cost_center_id` is attributed through the tenant-owned cost centre.
3. Master Contract owns `cost_center_id`; use it for LC actuals.
4. Vendor bills/GRNs/commercial invoices/stock issues contribute only when their existing links can be proven.
5. Style rolls up its orders; do not require currently nullable `style_id`/`order_id`.
6. Never use `Voucher.reference == order_code` as the primary match.
7. Unattributed actuals are a visible bucket, not silently allocated.
8. Overhead allocation is blocked until the user chooses a rule.

No posting logic is added. These services read POSTED, in-books, base-currency GL actuals.

#### APIs

```text
GET /api/v1/finance/control-tower?as_of_date=...&severity=all|high|medium|low
GET /api/v1/finance/control-tower/exceptions/{code}?limit=...&offset=...
GET /api/v1/finance/profitability/orders/{order_id}?from_date=...&to_date=...
GET /api/v1/finance/profitability/styles/{style_id}?from_date=...&to_date=...
GET /api/v1/finance/profitability/master-contracts/{id}?from_date=...&to_date=...
GET /api/v1/finance/profitability/buyers/{buyer_id}?from_date=...&to_date=...
GET /api/v1/finance/reconciliation/stock-vs-gl?as_of_date=...
```

Profitability shape:

```json
{
  "entity": {"type": "order", "id": 1, "code": "ORD-001"},
  "period": {"from_date": "...", "to_date": "..."},
  "budget": {"revenue": "0.0000", "material": "0.0000", "cm": "0.0000", "other": "0.0000"},
  "actual": {"revenue": "0.0000", "material": "0.0000", "cm": "0.0000",
             "overhead": "0.0000", "finance_cost": "0.0000", "other": "0.0000"},
  "gross_profit": "0.0000",
  "nett_profit": "0.0000",
  "margin_percent": null,
  "unattributed_actual": "0.0000",
  "coverage": {"direct_voucher_lines": 0, "cost_center_lines": 0, "unlinked_lines": 0},
  "drilldown": []
}
```

Control card:

```json
{
  "code": "GRN_NOT_BILLED",
  "label": "GRNs not billed",
  "severity": "high",
  "count": 3,
  "amount": "1000.0000",
  "oldest_date": "2026-10-01",
  "href": "/app/finance/home?tab=exceptions&exception=GRN_NOT_BILLED"
}
```

#### Acceptance criteria

3.1 Every card total equals its drill-down list.  
3.2 Every actual is POSTED, in-books, tenant-scoped and base currency.  
3.3 Order/LC/style/buyer rollups reconcile to their included GL lines.  
3.4 An unlinked GL line is disclosed, not guessed.  
3.5 Another tenant's order, style, buyer, contract or cost centre returns 404.  
3.6 Negative cash/stock and stock-vs-GL use the same statement/valuation services as Phase 2.  
3.7 Pending workflow counts exclude POSTED/CANCELLED/REJECTED according to existing statuses.  
3.8 Price/quantity variance remains informational until tolerance and enforcement are approved.  
3.9 Existing quotation-only profitability endpoints remain unchanged during comparison.  
3.10 Query-count tests prevent one query per order, voucher or exception.

#### Regression tests

- Cross-tenant denial for every entity route.
- Permission denial.
- Mixed currencies/base amount.
- Direct order, cost-centre LC, unlinked and reversed voucher fixtures.
- Double counting prevention where a voucher has both order and LC cost centre.
- Empty/zero revenue margin handling.
- Stock-vs-GL mismatch and exact-match cases.

#### Rollback

Disable `finance_control_tower_v2`; existing profitability and exception pages remain. No migration required.

### Phase 4 — Budget, expense analysis and controls

Size: **L**  
Flag: `finance_budget_analytics_v2`, default OFF, strict true.

#### Scope

Extend the existing budget-vs-actual foundation rather than replacing it:

- Budget versus actual by department/cost centre/account/month.
- Drill month -> cost centre -> account -> voucher.
- Monthly expense analysis and trends.
- Budget alerts using the existing warn/block mode.
- Expense-control exceptions: unusual increase, unbudgeted spend, repeated vendor/amount, missing cost centre.
- Keep all write/enforcement behavior under existing permissions and approval flow.

“Department” requires an explicit mapping decision. Do not equate HR department to Finance cost centre without approval.

#### APIs

```text
GET /api/v1/finance/budget-analytics?fiscal_year=...&dimension=cost_center|account|month|department
GET /api/v1/finance/budget-analytics/drilldown?...&limit=...&offset=...
GET /api/v1/finance/expense-analysis?from_date=...&to_date=...&group_by=month|account|cost_center|vendor
GET /api/v1/finance/expense-controls?as_of_date=...
```

```json
{
  "dimension": "cost_center",
  "rows": [{
    "id": 1,
    "label": "Factory",
    "budget": "100.0000",
    "actual": "90.0000",
    "variance": "10.0000",
    "variance_percent": "10.0000",
    "status": "within"
  }],
  "totals": {"budget": "100.0000", "actual": "90.0000", "variance": "10.0000"}
}
```

#### Expense claim / petty cash decision

Recommend a later optional phase, but it is **out of scope** until the user approves:

- employee claim submission;
- receipt/document handling;
- manager/finance approval;
- petty-cash custodian and imprest replenishment;
- posting mappings, audit and reversal;
- Bangladesh tax/VAT policy.

It is a posting workflow and therefore needs its own CRITICAL plan, migration and double-submit tests.

#### Acceptance criteria

4.1 Every slice totals to the same overall posted in-books base-currency actual.  
4.2 Budget, actual and variance drill down exactly to voucher lines.  
4.3 Month order follows tenant fiscal year.  
4.4 Explicit false permissions block budget override/export.  
4.5 Existing budget enforcement behavior and response shapes remain unchanged.  
4.6 Alerts use approved thresholds and show deterministic evidence.  
4.7 Cross-tenant cost centre/account/budget IDs look missing.  
4.8 Query counts are bounded across 12 months and all cost centres.

#### Rollback

Disable `finance_budget_analytics_v2`; existing Budgets page and enforcement continue unchanged.

### Phase 5 — Governed, read-only Finance AI

Size: **L**  
Flag: `finance_ai_insights_v2`, default OFF, plus existing AI flags and permissions.

#### Scope

- “Why did gross margin fall?” commentary attached to deterministic statements.
- Anomaly explanations for unusual expense, cash, receivable, payable and stock/GL movements.
- Finance exception agents in `backend/app/modules/governed_ai/`.
- Natural-language report questions through the existing AI tool registry.
- No AI posting, approval, classification edit or threshold change.

#### Guardrails

1. Compute all figures with Phase 2-4 services first.
2. Send only a bounded tenant-scoped payload to `generate_text_for_tenant`.
3. Every number allowed in generated text is supplied in a `fact_catalog` with a stable fact ID.
4. Validate numeric tokens/citations against the fact catalog; if validation fails, return deterministic commentary.
5. Require `finance.access` and fail-closed `ai.tools.finance.read`.
6. Export/narrative permissions do not imply posting permissions.
7. Use tenant AI budget, provider controls and audit metadata.
8. Never combine data from tenants, retrieval indexes or caches without tenant keys.
9. Exception-agent actions use the existing human-confirm mechanism; initial actions are navigation/acknowledgement only.
10. Provider unavailable, budget exhausted or permission denied fails closed to deterministic text.

#### API

```text
POST /api/v1/finance/statements/commentary
```

```json
{
  "report": "profit_loss",
  "from_date": "2026-07-01",
  "to_date": "2026-10-31",
  "comparison": "previous_period",
  "question": "Why did gross margin fall?"
}
```

```json
{
  "summary": "...",
  "findings": [{"text": "...", "fact_ids": ["gross_margin_current", "material_cost_variance"]}],
  "source": "ai",
  "deterministic_fallback": false,
  "facts": [{"id": "gross_margin_current", "value": "12.3400", "unit": "percent"}],
  "data_as_of": "..."
}
```

#### Acceptance criteria

5.1 Permission denial is fail closed.  
5.2 Provider failure and budget exhaustion return deterministic commentary without a 500.  
5.3 Every numeric statement cites a computed fact; invented numbers fail validation.  
5.4 Prompt/retrieval data is tenant-scoped and bounded.  
5.5 AI cannot post, approve, edit classification or execute an exception action without human confirmation.  
5.6 Deterministic report totals are identical whether AI is enabled or disabled.  
5.7 Logs contain no secrets or unrestricted financial payloads.  
5.8 Natural-language report tools use the same report services and permissions as the normal APIs.

#### Rollback

Disable `finance_ai_insights_v2` and existing AI flags. Deterministic reports and control pages continue.

## 5. Reconciliation rules

These are release gates, not optional diagnostics.

### Trial Balance

For each ledger:

```text
opening signed balance
  = stored account opening balance
  + all POSTED, in-books, base-currency debit-minus-credit movement before from_date

closing signed balance
  = opening signed balance + period debit - period credit
```

Display signed balances as one of Debit or Credit, never both.
Grand closing debit must equal grand closing credit. The synthetic P&L brought-forward line closes pre-FY
income/expense balances without creating a voucher.

### Balance Sheet

```text
Assets + accumulated loss
  = Liabilities + Capital + accumulated profit
```

Current-period P&L comes from the Phase 2 P&L service. Opening P&L is all retained result before the current FY.
The response exposes the difference; production acceptance requires `0.0000` within the same cent tolerance used
by posting, with the exact policy approved by Finance.

### Trading and Profit & Loss

P7 posts perpetual COGS, so the statement is GL-only:

```text
Gross result
  = Sales + Direct Income
    - COGS - Purchases (normally near zero) - Direct Expenses

Nett result
  = Gross result + Indirect Income - Indirect Expenses
  = classified TB income/expense movement for the period
```

Opening and closing FIFO stock are memo lines only. For a periodic comparison:

```text
periodic gross result = Sales + Direct Income + Closing Stock - Opening Stock - Purchases - Direct Expenses
disclosed stock adjustment = periodic gross result - GL gross result
```

### Cash Flow

For each month and fiscal year:

```text
nett_flow = inflow - outflow
closing_cash_pool = opening_cash_pool + nett_flow
```

The closing cash pool must equal the signed GL closing balances of Cash-in-hand, Bank Accounts and Bank OD classes.

Bank OD intentionally has three treatments, matching Tally — do not "reconcile" them into one:
it is part of the cash pool in Cash Flow, rolls into Loans (Liability) in the Trial Balance, Balance Sheet and
Debt/Equity ratio, and is excluded from Current Liabilities when working capital is computed for Funds Flow.

### Funds Flow

```text
working_capital = Current Assets - Current Liabilities
monthly funds_flow = month closing WC - month opening WC
year total flow = year closing WC - year opening WC
```

Month N closing must equal month N+1 opening.

### Stock versus GL control

At an as-of date:

```text
historical FIFO stock by RM/WIP/FG
versus
classified GL inventory balances
= disclosed difference
```

Never force the figures to match. Drill down to stock group/account and show unclassified values.

## 6. Performance plan, risks and mitigations

### Query and index plan

Existing indexes already support the core join and date filter:

- vouchers: `(tenant_id, status, voucher_date, id)`;
- voucher lines: `(tenant_id, account_id, voucher_id)` with entry/money columns;
- voucher lines: `(tenant_id, cost_center_id)`.

Therefore:

1. Build and benchmark aggregate queries before adding indexes.
2. Use one SQL aggregate for opening + period movement with conditional sums.
3. Use recursive CTEs once per request for group inheritance, not once per ledger.
4. Aggregate all 12 months in one query.
5. Fetch labels in one bounded query.
6. Cache only immutable/request-keyed report payloads with tenant, classification update timestamp and as-of date in key.
7. Invalidate classification-dependent cache after group changes.
8. Run `EXPLAIN (ANALYZE, BUFFERS)` locally on production-like volume.
9. If required, propose a separate concurrent index migration; do not add speculative indexes.
10. Keep exports streamed or generated to bounded temporary storage; no whole-database load.

Possible measured indexes:

```text
vouchers (tenant_id, voucher_date, id) WHERE status = 'POSTED'
voucher_lines (tenant_id, voucher_id, account_id, entry_type)
voucher_lines (tenant_id, cost_center_id, voucher_id) WHERE cost_center_id IS NOT NULL
```

Do not create them unless the query plan proves the existing indexes insufficient.

### Major risks

| Risk | Mitigation |
|---|---|
| Wrong CoA classification gives plausible but false statements | Explicit allowlist, deterministic backfill only, Unclassified bucket, setup preview, UAT sign-off |
| Closing stock double-counts perpetual COGS | GL-only Trading/P&L (verified perpetual posting); FIFO stock memo-only; acceptance 2.6 periodic comparison |
| Hub rollout breaks bookmarks/help | Flag-aware legacy wrapper, query/hash preservation, source-parsing route contract test |
| Facility users see links they cannot open | Hub-level permission filtering and existing route guards |
| Generic hub changes HR | HR is not migrated; run all HR tests |
| Large reports cause N+1/load spikes | SQL aggregation, query-count gates, pagination and measured indexes |
| Float precision leaks from existing stock helpers | New statement boundary converts SQL numeric to `Decimal`; do not use float-return helper for money |
| Profitability double-counts order and cost-centre links | Stable attribution precedence and line-level coverage report |
| Missing links make profitability incomplete | Visible unattributed bucket; no string guessing |
| AI invents explanations/numbers | Fact catalog, numeric validation, deterministic fallback |
| Old/new reports disagree during rollout | Side-by-side reconciliation and no deprecation before signed UAT |
| Classification downgrade loses setup work | Flags off first; export mappings before column downgrade |

## 7. Open questions for the user

Each question needs a business answer before the named feature is accepted.

1. **Which fiscal year should new reports open by default?**  
   Recommended default: use each tenant's configured `fiscal_year_start_month`; current FY through today.

2. **Should Bank OD be included in the cash pool exactly as the Tally sample does?**  
   Recommended default: yes, as a signed credit-balance cash-pool class, and disclose cash-without-OD separately.

3. **How should existing ambiguous account groups be classified?**  
   Recommended default: backfill only exact `system_code` matches; require a finance admin to classify the rest;
   show Unclassified until then.

4. **What should happen to stock groups that cannot be identified as RM, WIP or FG?**  
   Recommended default: keep NULL and show “Unclassified Stock”; do not silently put them in RM or Other.

5. **(Answered from code) Inventory policy.** P7 posts perpetual inventory and COGS (see Phase 2 P&L). The statement
   is GL-only; FIFO opening/closing stock is memo-only. Remaining question: should tenants that migrated Tally
   periodic balances see the periodic comparison line by default?  
   Recommended default: show it only when the disclosed stock adjustment is not zero.

6. **Which date defines historical WIP value when the current WIP endpoint is not historical?**  
   Recommended default: derive WIP from historical FIFO stock groups marked `WORK_IN_PROCESS`; do not use the current-only endpoint.

7. **Which account classes count as Current Assets and Current Liabilities for funds flow?**  
   Recommended default: use the explicit rollup listed in Phase 2; Bank OD remains Loans/short-term borrowing, not Current Liability.

8. **Which AR/AP source is authoritative for “due till today” and overdue control cards?**  
   Recommended default: select one bill-wise ledger source after reconciliation; keep the other two read-only until deprecated.

9. **What vendor-bill price and quantity variance tolerance is acceptable?**  
   Recommended default: informational warning at greater of 2% or BDT 500; no blocking until Finance approves.

10. **Which costs belong to an order P&L?**  
    Recommended default: direct order-linked GL lines plus explicitly mapped order cost-centre lines; show everything
    else as unattributed.

11. **How should shared factory/admin overhead be allocated to order, style and buyer profitability?**  
    Recommended default: no allocation in the first release; later choose SAM minutes, production quantity,
    revenue or a user-maintained driver.

12. **When both `voucher.order_id` and an LC cost centre are present, which profitability entity owns the line?**  
    Recommended default: order owns the detailed line; LC and buyer reports roll up the order so the line is not duplicated.

13. **Which revenue date should profitability use: invoice, challan/shipment, or GL posting date?**  
    Recommended default: GL voucher date for actual P&L; show shipment date as an operational comparison only.

14. **How is buyer identity determined across customer, order and master contract records?**  
    Recommended default: use the order/customer relationship, with contract rollup only where that link is explicit.

15. **Should negative stock and stock-vs-GL differences block any workflow?**  
    Recommended default: alert only in this program; blocking needs a separate approved business rule.

16. **What budget breach thresholds and escalation recipients should apply?**  
    Recommended default: reuse existing tenant warn/block mode; alerts at 80%, 100% and 110%; no new blocking rule.

17. **Does “department budget” mean HR Department, Finance Cost Centre, or a maintained mapping?**  
    Recommended default: Finance Cost Centre first; add department mapping only after ownership is defined.

18. **Should expense claims and petty cash be added?**  
    Recommended default: yes as a later optional CRITICAL phase after reports and controls are stable; not in Phases 0-5.

19. **Who may edit statement classification?**  
    Recommended default: existing Account Groups write permission for admin/manager, with audit; report viewers are read-only.

20. **When may classic reports be deprecated?**  
    Recommended default: after two month-end closes reconcile and Finance signs UAT; keep routes for at least one further release.

21. **Should AI use an external provider for Finance commentary?**  
    Recommended default: use the tenant's existing approved `generate_text_for_tenant` provider/budget; if disabled,
    return deterministic commentary only.

22. **May AI exception agents create tasks or only suggest navigation?**  
    Recommended default: first release is read-only suggestions/navigation; task creation requires separate human-confirm approval.

23. **What rounding tolerance is acceptable for statement reconciliation?**  
    Recommended default: compute at 4 decimals, display 2 where required, and require exact 4-decimal equality after
    the established base-currency line rounding; investigate rather than hide differences.

24. **Should Finance Home be the first Finance link when hubs are enabled?**  
    Recommended default: yes; users land on exceptions, cash, profit and pending work rather than setup/transactions.

## 8. Suggested implementation-agent build order

### Required sequence

1. **Plan audit:** `plan-auditor` reviews this CRITICAL/ADVANCED plan.
2. **Phase 0:** parent/backend developer writes golden tests, fixes the three known report defects, runs focused and
   neighbouring finance tests.
3. **Phase 1:** frontend developer builds generic hub primitives and Finance hubs behind `finance_hubs_v2`;
   tutorials are updated in the same PR.
4. **Phase 2A:** backend developer adds account/stock classification migrations, schemas, setup endpoints and tests.
5. **Finance data sign-off:** finance admin reviews Unclassified mappings; user answers stock-accounting questions.
6. **Phase 2B:** backend developer builds shared ledger/stock aggregates and six services.
7. **Phase 2C:** frontend developer builds statement screens/drill-down/export against frozen contracts.
8. **Statement UAT:** compare old/new/Tally samples and close two month-end fixture sets.
9. **Phase 3:** backend and frontend build Control Tower/profitability after attribution rules are approved.
10. **Phase 4:** build budget/expense analytics; do not add claim/petty-cash posting.
11. **Phase 5:** add governed AI only after deterministic services pass UAT.
12. **Final gates per CRITICAL phase:** focused + neighbouring tests, QA review, then one
    `security-auditor-premium` review of the final diff.

### Safe parallel work with disjoint files

- After Phase 0 contracts are fixed:
  - Frontend agent: generic hubs, Finance config, navigation tests.
  - Backend agent: classification constants/migration/service/tests.
- After statement schemas are frozen:
  - Backend agent A: TB/BS/P&L services.
  - Backend agent B: cash/funds/ratios only in a separate worktree and disjoint files.
  - Frontend agent: statement components/API client in a separate worktree.
- After Phase 2 services are stable:
  - Backend agent: Control Tower/profitability.
  - Frontend agent: Control Tower UI using mocked frozen contracts.

Do not run two writers in the same checkout. The parent runs Docker backend tests and npm frontend checks, supplies
the visible output to independent reviewers, and performs all integration.

### Verification matrix before each flag is enabled

```text
Backend:
  docker compose exec backend pytest <focused tests> -q
  docker compose exec backend pytest tests/test_route_permission_inventory.py tests/test_rls_policies.py -q
  docker compose exec backend python -c "import app.main"

Frontend:
  cd frontend
  npm run lint
  npm run build
  npm test -- <hub/statement/control focused tests>

Manual:
  flag OFF compatibility
  flag ON role/tenant matrix
  January and July fiscal years
  lakh/crore PDF/XLSX
  old bookmark + query + hash
  phone More/search
  Tally sample reconciliation
```

No production migration, flag enablement, deploy, commit or push is part of this architecture plan.

**Owner release gate:** no Finance flag is switched on for a live tenant and nothing is deployed until the
section 5 reconciliation and two month-end UAT sets pass. This is the business owner's decision, not the
implementer's.
