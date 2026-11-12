/**
 * Tally-style statements API client (Finance modernization, Phase 2).
 * Backend: backend/app/modules/finance/statements/ (schemas.py, flow_schemas.py, router.py).
 * Every amount is a decimal STRING with 4 places. Never turn it into a JS number for arithmetic
 * (use `components/finance/statements/statementFormat.ts` to show or subtract amounts).
 * All routes need the tenant flag `finance_statements_v2` (otherwise 404).
 */
import { request, requestBlob } from "@/api/core";

const BASE = "/api/v1/finance";

export type Money = string;
export type DrCr = "Dr" | "Cr" | "";

// ---------------------------------------------------------------- common envelope
export interface StatementCompany {
  name: string;
  address?: string | null;
  email?: string | null;
}

export interface StatementPeriod {
  from_date?: string | null;
  to_date?: string | null;
  as_of_date?: string | null;
  fiscal_year: string;
  fiscal_year_start: string;
  fiscal_year_end: string;
}

export interface StatementWarning {
  code: string;
  count: number;
  amount: Money;
}

export interface StatementReconciliation {
  balanced: boolean;
  difference: Money;
  /**
   * Trial Balance / Balance Sheet only: stored debit-side minus credit-side opening balances (signed).
   * Non-zero = the sheet carries a "Difference in opening balances" line and `difference` is what is left after it.
   */
  opening_difference?: Money;
}

/**
 * Trial Balance / Balance Sheet reconciliation (always carries the opening difference).
 * The synthetic line has code DIFFERENCE_IN_OPENING_BALANCES and the warning code is OPENING_BALANCE_DIFFERENCE
 * (constants in `components/finance/statements/openingDifference.ts`).
 */
export interface SheetReconciliation extends StatementReconciliation {
  opening_difference: Money;
}

export interface StatementEnvelope {
  report: string;
  company: StatementCompany;
  period: StatementPeriod;
  base_currency: string;
  warnings: StatementWarning[];
  reconciliation: StatementReconciliation;
  data_as_of: string;
}

// ---------------------------------------------------------------- Trial Balance
export interface TrialBalanceRow {
  row_type: "primary" | "group" | "ledger" | "profit_and_loss" | "opening_difference";
  /** DIFFERENCE_IN_OPENING_BALANCES on the synthetic opening-difference row. */
  code?: string | null;
  id?: number | null;
  parent_id?: number | null;
  name: string;
  depth: number;
  statement_class?: string | null;
  opening_debit: Money;
  opening_credit: Money;
  period_debit: Money;
  period_credit: Money;
  closing_debit: Money;
  closing_credit: Money;
  dr_cr: DrCr;
  drilldown: {
    kind: "primary" | "group" | "ledger" | "unclassified" | "profit_and_loss" | "opening_difference";
    id?: number | null;
  };
}

export interface TrialBalanceTotals {
  opening_debit: Money;
  opening_credit: Money;
  period_debit: Money;
  period_credit: Money;
  closing_debit: Money;
  closing_credit: Money;
}

export interface TrialBalanceStatement extends StatementEnvelope {
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  reconciliation: SheetReconciliation;
}

// ---------------------------------------------------------------- two-sided statements
export interface SheetNode {
  name: string;
  row_type: "primary" | "group" | "ledger" | "result" | "opening_difference";
  /** DIFFERENCE_IN_OPENING_BALANCES on the synthetic opening-difference line. */
  code?: string | null;
  id?: number | null;
  inner_amount?: Money | null;
  outer_amount?: Money | null;
  children: SheetNode[];
}

export interface BalanceSheetStatement extends StatementEnvelope {
  liabilities: SheetNode[];
  assets: SheetNode[];
  profit_and_loss: { opening: Money; current_period: Money; amount: Money; side: "liabilities" | "assets" };
  totals: { liabilities: Money; assets: Money; difference: Money };
  reconciliation: SheetReconciliation;
}

export interface StockMemo {
  raw_material?: Money | null;
  work_in_process?: Money | null;
  finished_goods?: Money | null;
}

export interface Result {
  kind: "profit" | "loss";
  amount: Money;
}

export interface ProfitLossStatement extends StatementEnvelope {
  trading: {
    debit_rows: SheetNode[];
    credit_rows: SheetNode[];
    opening_stock: StockMemo;
    closing_stock: StockMemo;
    memo_stock_status: "NOT_COMPUTED" | "FIFO_MEMO";
    gross_result: Result;
    debit_total: Money;
    credit_total: Money;
  };
  profit_and_loss: {
    debit_rows: SheetNode[];
    credit_rows: SheetNode[];
    gross_brought_forward: Result;
    nett_result: Result;
    debit_total: Money;
    credit_total: Money;
  };
  stock_adjustment?: { gl_gross_result: Money; periodic_gross_result: Money; stock_adjustment: Money } | null;
  income_expense_movement: Money;
}

// ---------------------------------------------------------------- monthly Cash Flow
export interface CashFlowMonth {
  month: string;
  label: string;
  from_date: string;
  to_date: string;
  opening_cash: Money;
  inflow: Money;
  outflow: Money;
  nett_flow: Money;
  closing_cash: Money;
  drilldown: { kind: "month"; value: string };
}

export interface CashFlowStatement extends StatementEnvelope {
  fiscal_year: number;
  opening_cash: Money;
  opening_dr_cr: DrCr;
  months: CashFlowMonth[];
  grand_total: { inflow: Money; outflow: Money; nett_flow: Money; closing_cash: Money };
  gl_closing_cash: Money;
  closing_pool: { cash_in_hand: Money; bank_accounts: Money; bank_od: Money; cash_without_od: Money };
  contra_excluded: Money;
}

// ---------------------------------------------------------------- monthly Funds Flow
export interface FundsFlowMonth {
  month: string;
  label: string;
  from_date: string;
  to_date: string;
  working_capital_opening: Money;
  working_capital_closing: Money;
  funds_flow: Money;
  current_assets_closing: Money;
  current_liabilities_closing: Money;
}

export interface FundsFlowStatement extends StatementEnvelope {
  fiscal_year: number;
  months: FundsFlowMonth[];
  grand_total: { working_capital_opening: Money; working_capital_closing: Money; funds_flow: Money };
}

// ---------------------------------------------------------------- Ratio Analysis
export interface PrincipalGroup {
  code: string;
  label: string;
  amount?: Money | null;
  dr_cr: DrCr;
  value?: Money | null;
  unit?: string | null;
  reason?: string | null;
  /** "Due till today" lines only (tenant setting finance_ar_ap_due_source): all open bills, the bill source and caveats. */
  total_open?: Money | null;
  source?: string | null;
  /** True = no bill source set in Settings; the standard one was chosen automatically (the note says so). */
  source_automatic?: boolean | null;
  note?: string | null;
}

export interface PrincipalRatio {
  code: string;
  label: string;
  numerator?: Money | null;
  denominator?: Money | null;
  value?: Money | null;
  unit: "ratio" | "percent" | "days" | "times";
  display: string;
  reason?: string | null;
}

export interface RatioAnalysisStatement extends StatementEnvelope {
  principal_groups: PrincipalGroup[];
  principal_ratios: PrincipalRatio[];
}

// ---------------------------------------------------------------- Stock versus GL
export interface StockGlStatement extends StatementEnvelope {
  by_nature: { nature: string; fifo_value: Money; line_count: number }[];
  fifo_total: Money;
  gl_total: Money;
  difference: Money;
  unclassified_stock: Money;
  gl_ledgers: { account_id: number; name: string; group_id: number; balance: Money }[];
}

// ---------------------------------------------------------------- drill-down
export interface DrillAmounts {
  opening: Money;
  debit: Money;
  credit: Money;
  closing: Money;
  opening_dr_cr: DrCr;
  closing_dr_cr: DrCr;
}

export interface DrillRow extends DrillAmounts {
  row_type: "group" | "ledger";
  id: number;
  name: string;
  statement_class?: string | null;
}

export interface DrillGroupResult extends StatementEnvelope {
  group_id: number;
  group_name: string;
  parent_group_id?: number | null;
  rows: DrillRow[];
  total: DrillAmounts;
}

export interface DrillVoucherRow {
  voucher_id: number;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  description?: string | null;
  debit: Money;
  credit: Money;
  running_balance: Money;
}

export interface DrillLedgerResult extends StatementEnvelope {
  account_id: number;
  account_name: string;
  group_id: number;
  opening: Money;
  period_debit: Money;
  period_credit: Money;
  closing: Money;
  total_vouchers: number;
  limit: number;
  offset: number;
  rows: DrillVoucherRow[];
}

export interface DrillCashFlowResult extends StatementEnvelope {
  month: string;
  inflow: Money;
  outflow: Money;
  nett_flow: Money;
  contra_excluded: Money;
  ledgers: { account_id: number; name: string; statement_class?: string | null; debit: Money; credit: Money }[];
  total_debit: Money;
  total_credit: Money;
}

// ---------------------------------------------------------------- setup (classification)
export interface AffectedGroup {
  id: number;
  name: string;
  current_effective_class?: string | null;
}

export interface StatementClassState {
  group_id: number;
  name: string;
  parent_group_id?: number | null;
  statement_class?: string | null;
  effective_class?: string | null;
  inherited_from_group_id?: number | null;
  allowed_classes: string[];
  proposed_class?: string | null;
  affected_group_count: number;
  affected_ledger_count: number;
  affected_groups: AffectedGroup[];
  reports: string[];
}

export interface StockNatureState {
  group_id: number;
  name: string;
  parent_id?: number | null;
  stock_nature?: string | null;
  effective_nature?: string | null;
  inherited_from_group_id?: number | null;
  allowed_natures: string[];
}

// ---------------------------------------------------------------- requests
/** Period inputs the backend accepts. Use `fiscal_year` alone OR dates (the backend answers 422 for both). */
export interface StatementQuery {
  from_date?: string;
  to_date?: string;
  as_of_date?: string;
  fiscal_year?: number;
  include_zero?: boolean;
}

export type StatementExportReport =
  | "trial-balance"
  | "balance-sheet"
  | "profit-loss"
  | "cash-flow-monthly"
  | "funds-flow-monthly"
  | "ratio-analysis";

export type StatementExportFormat = "xlsx" | "pdf";

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

export const financeStatementsApi = {
  getTrialBalance: (q: StatementQuery) =>
    request<TrialBalanceStatement>(`${BASE}/statements/trial-balance${qs({ ...q })}`),
  getBalanceSheet: (q: StatementQuery) =>
    request<BalanceSheetStatement>(`${BASE}/statements/balance-sheet${qs({ ...q })}`),
  getProfitLoss: (q: StatementQuery) => request<ProfitLossStatement>(`${BASE}/statements/profit-loss${qs({ ...q })}`),
  getCashFlowMonthly: (q: Pick<StatementQuery, "fiscal_year">) =>
    request<CashFlowStatement>(`${BASE}/statements/cash-flow-monthly${qs({ ...q })}`),
  getFundsFlowMonthly: (q: Pick<StatementQuery, "fiscal_year">) =>
    request<FundsFlowStatement>(`${BASE}/statements/funds-flow-monthly${qs({ ...q })}`),
  getRatioAnalysis: (q: StatementQuery) =>
    request<RatioAnalysisStatement>(`${BASE}/statements/ratio-analysis${qs({ ...q })}`),
  getStockGlReconciliation: (q: Pick<StatementQuery, "as_of_date">) =>
    request<StockGlStatement>(`${BASE}/statements/stock-gl-reconciliation${qs({ ...q })}`),

  drillGroup: (groupId: number, q: Pick<StatementQuery, "from_date" | "to_date">) =>
    request<DrillGroupResult>(`${BASE}/statements/drill/group${qs({ group_id: groupId, ...q })}`),
  drillLedger: (
    accountId: number,
    q: Pick<StatementQuery, "from_date" | "to_date"> & { limit?: number; offset?: number },
  ) => request<DrillLedgerResult>(`${BASE}/statements/drill/ledger${qs({ account_id: accountId, ...q })}`),
  drillCashFlow: (month: string, fiscalYear?: number) =>
    request<DrillCashFlowResult>(`${BASE}/statements/drill/cash-flow${qs({ month, fiscal_year: fiscalYear })}`),

  /** Excel or PDF of the same numbers. Save the blob with `saveBlob`. 403 = no export permission. */
  exportStatement: (report: StatementExportReport, format: StatementExportFormat, q: StatementQuery) =>
    requestBlob(`${BASE}/statements/${report}/export${qs({ format, ...q })}`),

  getStatementClass: (groupId: number, proposed?: string | null) =>
    request<StatementClassState>(`${BASE}/account-groups/${groupId}/statement-class${qs({ proposed })}`),
  setStatementClass: (groupId: number, statementClass: string | null) =>
    request<StatementClassState>(`${BASE}/account-groups/${groupId}/statement-class`, {
      method: "PUT",
      body: JSON.stringify({ statement_class: statementClass }),
    }),
  getStockNature: (groupId: number) => request<StockNatureState>(`${BASE}/stock-groups/${groupId}/stock-nature`),
  setStockNature: (groupId: number, stockNature: string | null) =>
    request<StockNatureState>(`${BASE}/stock-groups/${groupId}/stock-nature`, {
      method: "PUT",
      body: JSON.stringify({ stock_nature: stockNature }),
    }),
};
