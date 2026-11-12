// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope, MEMBER_ME } from "@/components/finance/statements/statementTestFixtures";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  api: {
    getTrialBalance: vi.fn(),
    getBalanceSheet: vi.fn(),
    getProfitLoss: vi.fn(),
    getCashFlowMonthly: vi.fn(),
    getFundsFlowMonthly: vi.fn(),
    getRatioAnalysis: vi.fn(),
    getStockGlReconciliation: vi.fn(),
    drillGroup: vi.fn(),
    drillLedger: vi.fn(),
    drillCashFlow: vi.fn(),
    exportStatement: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeStatements", () => ({ financeStatementsApi: h.api }));

import { BalanceSheetStatementPage } from "./BalanceSheetStatementPage";
import { CashFlowMonthlyPage } from "./CashFlowMonthlyPage";
import { FundsFlowMonthlyPage } from "./FundsFlowMonthlyPage";
import { ProfitLossStatementPage } from "./ProfitLossStatementPage";
import { RatioAnalysisStatementPage } from "./RatioAnalysisStatementPage";
import { StockGlReconciliationPage } from "./StockGlReconciliationPage";
import { TrialBalanceStatementPage } from "./TrialBalanceStatementPage";

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  h.me = { ...MEMBER_ME };
  for (const fn of Object.values(h.api)) fn.mockReset();
});
afterEach(cleanup);

describe("Trial Balance statement", () => {
  const tb = () => ({
    ...envelope("trial_balance", {
      warnings: [{ code: "UNCLASSIFIED_GROUPS", count: 2, amount: "100.0000" }],
    }),
    rows: [
      {
        row_type: "primary", id: null, name: "Current Assets", depth: 0,
        opening_debit: "0.0000", opening_credit: "0.0000", period_debit: "125.0000", period_credit: "25.0000",
        closing_debit: "100.0000", closing_credit: "0.0000", dr_cr: "Dr", drilldown: { kind: "primary", id: null },
      },
      {
        row_type: "group", id: 10, name: "Sundry Debtors", depth: 1,
        opening_debit: "0.0000", opening_credit: "0.0000", period_debit: "125.0000", period_credit: "25.0000",
        closing_debit: "1813863870.2600", closing_credit: "0.0000", dr_cr: "Dr", drilldown: { kind: "group", id: 10 },
      },
    ],
    totals: {
      opening_debit: "0.0000", opening_credit: "0.0000", period_debit: "125.0000", period_credit: "125.0000",
      closing_debit: "1813863870.2600", closing_credit: "1813863870.2600",
    },
  });

  it("shows the company header, lakh/crore totals, the balanced badge and the unclassified banner", async () => {
    h.api.getTrialBalance.mockResolvedValue(tb());
    renderPage(<TrialBalanceStatementPage />);
    expect(await screen.findByText("Prime Garments Ltd")).toBeInTheDocument();
    expect(screen.getByText("Sundry Debtors")).toBeInTheDocument();
    const total = screen.getByTestId("tb-grand-total");
    expect(within(total).getAllByText("1,81,38,63,870.26")).toHaveLength(2);
    expect(screen.getByTestId("reconciliation-badge")).toHaveTextContent("Balanced");
    const link = screen.getByRole("link", { name: /Set the Statement class in Account Groups/ });
    expect(link).toHaveAttribute("href", "/app/accounts/groups");
    expect(screen.getByText(/2 account group\(s\)/)).toBeInTheDocument();
  });

  it("asks the API for the chosen financial year only (never year and dates together)", async () => {
    h.api.getTrialBalance.mockResolvedValue(tb());
    renderPage(<TrialBalanceStatementPage />);
    await screen.findByText("Prime Garments Ltd");
    const query = h.api.getTrialBalance.mock.calls[0]![0] as Record<string, unknown>;
    expect(typeof query.fiscal_year).toBe("number");
    expect(query.from_date).toBeUndefined();
  });

  it("shows an empty state when there are no rows", async () => {
    h.api.getTrialBalance.mockResolvedValue({ ...tb(), rows: [], warnings: [] });
    renderPage(<TrialBalanceStatementPage />);
    expect(await screen.findByText("No balances in this period.")).toBeInTheDocument();
  });

  it("shows a message and no data for a 403", async () => {
    h.api.getTrialBalance.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPage(<TrialBalanceStatementPage />);
    expect(await screen.findByText("You do not have permission to view this statement.")).toBeInTheDocument();
  });

  it("shows the error text with a Retry button for other failures", async () => {
    h.api.getTrialBalance.mockRejectedValueOnce(new Error("Server exploded")).mockResolvedValue(tb());
    renderPage(<TrialBalanceStatementPage />);
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sundry Debtors")).toBeInTheDocument();
  });

  it("does not call the API and explains when the statements switch is off", () => {
    h.me = { ...MEMBER_ME, feature_flags: {} };
    renderPage(<TrialBalanceStatementPage />);
    expect(screen.getByText("Tally-style statements are switched off")).toBeInTheDocument();
    expect(h.api.getTrialBalance).not.toHaveBeenCalled();
  });

  it("shows the 'Difference in opening balances' row in italics without a drill-down, plus the notice and badge", async () => {
    const base = tb();
    h.api.getTrialBalance.mockResolvedValue({
      ...base,
      warnings: [{ code: "OPENING_BALANCE_DIFFERENCE", count: 1, amount: "1234.5000" }],
      reconciliation: { balanced: true, difference: "0.0000", opening_difference: "1234.5000" },
      rows: [
        ...base.rows,
        {
          row_type: "opening_difference", code: "DIFFERENCE_IN_OPENING_BALANCES", id: null, name: "Difference in opening balances", depth: 0,
          opening_debit: "0.0000", opening_credit: "1234.5000", period_debit: "0.0000", period_credit: "0.0000",
          closing_debit: "0.0000", closing_credit: "1234.5000", dr_cr: "Cr", drilldown: { kind: "opening_difference", id: null },
        },
      ],
    });
    renderPage(<TrialBalanceStatementPage />);
    const row = await screen.findByTestId("opening-difference-row");
    expect(row).toHaveTextContent("Difference in opening balances");
    expect(row.className).toContain("italic");
    expect(row.className).toContain("text-status-warning-foreground");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Difference in opening balances" })).toBeNull();
    fireEvent.click(within(row).getByText("Difference in opening balances"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.api.drillGroup).not.toHaveBeenCalled();
    expect(h.api.drillLedger).not.toHaveBeenCalled();

    const notice = screen.getByTestId("opening-difference-notice");
    expect(notice).toHaveTextContent(
      'Opening balances do not match by 1,234.50 Dr. Tally shows this as "Difference in opening balances". A finance admin should correct the ledgers\' opening balances in Chart of Accounts.',
    );
    expect(within(notice).getByRole("link", { name: "Chart of Accounts" })).toHaveAttribute("href", "/app/accounts");
    expect(screen.getByTestId("reconciliation-badge")).toHaveTextContent("Balanced (after opening difference)");
  });

  it("writes a credit-heavy opening difference as Cr", async () => {
    h.api.getTrialBalance.mockResolvedValue({
      ...tb(),
      warnings: [{ code: "OPENING_BALANCE_DIFFERENCE", count: 1, amount: "-500.0000" }],
      reconciliation: { balanced: true, difference: "0.0000", opening_difference: "-500.0000" },
    });
    renderPage(<TrialBalanceStatementPage />);
    expect(await screen.findByTestId("opening-difference-notice")).toHaveTextContent("Opening balances do not match by 500.00 Cr.");
  });

  it("keeps the plain 'Balanced' badge when there is no opening difference", async () => {
    h.api.getTrialBalance.mockResolvedValue({ ...tb(), reconciliation: { balanced: true, difference: "0.0000", opening_difference: "0.0000" } });
    renderPage(<TrialBalanceStatementPage />);
    const badge = await screen.findByTestId("reconciliation-badge");
    expect(badge.textContent).toBe("Balanced");
    expect(screen.queryByTestId("opening-difference-notice")).toBeNull();
    expect(screen.queryByTestId("opening-difference-row")).toBeNull();
  });

  it("opens the drill-down panel when a group is clicked", async () => {
    h.api.getTrialBalance.mockResolvedValue(tb());
    h.api.drillGroup.mockResolvedValue({
      ...envelope("drill_group"), group_id: 10, group_name: "Sundry Debtors", rows: [],
      total: { opening: "0.0000", debit: "0.0000", credit: "0.0000", closing: "0.0000", opening_dr_cr: "", closing_dr_cr: "" },
    });
    renderPage(<TrialBalanceStatementPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sundry Debtors" }));
    expect(await screen.findByRole("dialog", { name: /Drill-down: Sundry Debtors/ })).toBeInTheDocument();
    expect(h.api.drillGroup).toHaveBeenCalledWith(10, expect.objectContaining({ from_date: "2026-07-01" }));
  });
});

describe("Balance Sheet statement", () => {
  const node = (name: string, outer: string) => ({ name, row_type: "primary", id: null, outer_amount: outer, inner_amount: null, children: [] });
  const bs = (difference: string, balanced: boolean) => ({
    ...envelope("balance_sheet", { reconciliation: { balanced, difference } }),
    liabilities: [node("Current Liabilities", "500.0000")],
    assets: [node("Current Assets", "500.0000")],
    profit_and_loss: { opening: "0.0000", current_period: "0.0000", amount: "0.0000", side: "liabilities" },
    totals: { liabilities: "500.0000", assets: "500.0000", difference },
  });

  it("shows both sides with their totals", async () => {
    h.api.getBalanceSheet.mockResolvedValue(bs("0.0000", true));
    renderPage(<BalanceSheetStatementPage />);
    expect(await screen.findByText("Current Liabilities")).toBeInTheDocument();
    expect(screen.getByText("Current Assets")).toBeInTheDocument();
    expect(screen.getByTestId("total-Total Liabilities")).toHaveTextContent("500.00");
    expect(screen.getByTestId("total-Total Assets")).toHaveTextContent("500.00");
    expect(screen.getByTestId("reconciliation-badge")).toHaveTextContent("Balanced");
  });

  it("shows the difference when the sheet is out of balance", async () => {
    h.api.getBalanceSheet.mockResolvedValue(bs("5.0000", false));
    renderPage(<BalanceSheetStatementPage />);
    expect(await screen.findByText("Difference 5.00")).toBeInTheDocument();
  });

  it("shows the opening difference line without a drill-down, with the notice and badge", async () => {
    const base = bs("0.0000", true);
    h.api.getBalanceSheet.mockResolvedValue({
      ...base,
      warnings: [{ code: "OPENING_BALANCE_DIFFERENCE", count: 1, amount: "250.0000" }],
      reconciliation: { balanced: true, difference: "0.0000", opening_difference: "250.0000" },
      liabilities: [
        { ...node("Current Liabilities", "250.0000"), children: [{ name: "Creditors", row_type: "group", id: 7, outer_amount: "250.0000", inner_amount: null, children: [] }] },
        // id set on purpose: the line must still not open a drill-down.
        { name: "Difference in opening balances", row_type: "opening_difference", code: "DIFFERENCE_IN_OPENING_BALANCES", id: 99, outer_amount: "250.0000", inner_amount: null, children: [] },
      ],
    });
    renderPage(<BalanceSheetStatementPage />);
    const row = await screen.findByTestId("opening-difference-row");
    expect(row).toHaveTextContent("Difference in opening balances");
    expect(row).toHaveTextContent("250.00");
    const label = within(row).getByText("Difference in opening balances");
    expect(label.className).toContain("italic");
    expect(label.className).toContain("text-status-warning-foreground");
    expect(within(row).queryByRole("button")).toBeNull();
    // Normal groups still drill.
    expect(screen.getByRole("button", { name: "Creditors" })).toBeInTheDocument();
    fireEvent.click(label);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.api.drillGroup).not.toHaveBeenCalled();

    expect(screen.getByTestId("opening-difference-notice")).toHaveTextContent("Opening balances do not match by 250.00 Dr.");
    expect(screen.getByRole("link", { name: "Chart of Accounts" })).toHaveAttribute("href", "/app/accounts");
    expect(screen.getByTestId("reconciliation-badge")).toHaveTextContent("Balanced (after opening difference)");
  });
});

describe("Trading and Profit & Loss statement", () => {
  const pl = () => ({
    ...envelope("profit_loss"),
    trading: {
      debit_rows: [{ name: "Purchase Accounts", row_type: "primary", id: null, outer_amount: "100.0000", inner_amount: null, children: [] }],
      credit_rows: [{ name: "Sales Accounts", row_type: "primary", id: null, outer_amount: "300.0000", inner_amount: null, children: [] }],
      opening_stock: { raw_material: "7770000.0000", work_in_process: null, finished_goods: null },
      closing_stock: { raw_material: null, work_in_process: null, finished_goods: "8880000.0000" },
      memo_stock_status: "FIFO_MEMO",
      gross_result: { kind: "profit", amount: "200.0000" },
      debit_total: "300.0000",
      credit_total: "300.0000",
    },
    profit_and_loss: {
      debit_rows: [], credit_rows: [],
      gross_brought_forward: { kind: "profit", amount: "200.0000" },
      nett_result: { kind: "profit", amount: "150.0000" },
      debit_total: "200.0000", credit_total: "200.0000",
    },
    stock_adjustment: null,
    income_expense_movement: "150.0000",
  });

  it("shows the totals and keeps the memo stock out of them", async () => {
    h.api.getProfitLoss.mockResolvedValue(pl());
    renderPage(<ProfitLossStatementPage />);
    expect(await screen.findByText("Purchase Accounts")).toBeInTheDocument();
    expect(screen.getByTestId("total-Trading debit total")).toHaveTextContent("300.00");
    expect(screen.getByTestId("total-Trading credit total")).toHaveTextContent("300.00");
    expect(screen.getByTestId("total-P&L debit total")).toHaveTextContent("200.00");

    const memo = screen.getByRole("region", { name: "Memo: opening and closing stock" });
    expect(within(memo).getByText(/not in any total above/)).toBeInTheDocument();
    expect(within(memo).getByText("77,70,000.00")).toBeInTheDocument();
    expect(within(memo).getByText("88,80,000.00")).toBeInTheDocument();
    // The memo amounts appear nowhere else on the page, in particular not in a total.
    expect(screen.getAllByText("77,70,000.00")).toHaveLength(1);
    expect(screen.getAllByText("88,80,000.00")).toHaveLength(1);
  });

  it("writes the gross and nett results", async () => {
    h.api.getProfitLoss.mockResolvedValue(pl());
    renderPage(<ProfitLossStatementPage />);
    expect(await screen.findByText(/Gross result/)).toHaveTextContent("200.00 profit");
    expect(screen.getByText(/Nett result/)).toHaveTextContent("150.00 profit");
  });
});

describe("monthly Cash Flow statement", () => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 6) % 12) + 1; // July first
    const year = m >= 7 ? 2026 : 2027;
    const key = `${year}-${String(m).padStart(2, "0")}`;
    return {
      month: key, label: `M${i + 1}`, from_date: `${key}-01`, to_date: `${key}-28`,
      opening_cash: "100.0000", inflow: "50.0000", outflow: "25.0000", nett_flow: "25.0000", closing_cash: "125.0000",
      drilldown: { kind: "month", value: key },
    };
  });
  const cf = () => ({
    ...envelope("cash_flow"),
    fiscal_year: 2026,
    opening_cash: "100.0000",
    opening_dr_cr: "Dr",
    months,
    grand_total: { inflow: "600.0000", outflow: "300.0000", nett_flow: "300.0000", closing_cash: "400.0000" },
    gl_closing_cash: "400.0000",
    closing_pool: { cash_in_hand: "10.0000", bank_accounts: "500.0000", bank_od: "-110.0000", cash_without_od: "510.0000" },
    contra_excluded: "75.0000",
  });

  it("lists 12 months and the year total, with contra and cash without overdraft", async () => {
    h.api.getCashFlowMonthly.mockResolvedValue(cf());
    renderPage(<CashFlowMonthlyPage />);
    expect(await screen.findByText("M1")).toBeInTheDocument();
    for (let i = 1; i <= 12; i++) expect(screen.getByText(`M${i}`)).toBeInTheDocument();
    expect(within(screen.getByTestId("cash-grand-total")).getByText("600.00")).toBeInTheDocument();
    expect(screen.getByTestId("contra-note")).toHaveTextContent("75.00");
    expect(screen.getByTestId("cash-without-od")).toHaveTextContent("510.00 Dr");
  });

  it("opens the month drill-down with the year and month", async () => {
    h.api.getCashFlowMonthly.mockResolvedValue(cf());
    h.api.drillCashFlow.mockResolvedValue({
      ...envelope("drill_cash"), month: "2026-07", inflow: "50.0000", outflow: "25.0000", nett_flow: "25.0000",
      contra_excluded: "0.0000", ledgers: [{ account_id: 5, name: "Cash in hand", debit: "50.0000", credit: "25.0000" }],
      total_debit: "50.0000", total_credit: "25.0000",
    });
    renderPage(<CashFlowMonthlyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "M1" }));
    expect(await screen.findByText("Cash in hand")).toBeInTheDocument();
    expect(h.api.drillCashFlow).toHaveBeenCalledWith("2026-07", expect.any(Number));
  });
});

describe("monthly Funds Flow statement", () => {
  it("shows opening, closing and flow with the year total", async () => {
    h.api.getFundsFlowMonthly.mockResolvedValue({
      ...envelope("funds_flow"),
      fiscal_year: 2026,
      months: [
        {
          month: "2026-07", label: "Jul 2026", from_date: "2026-07-01", to_date: "2026-07-31",
          working_capital_opening: "100.0000", working_capital_closing: "120.0000", funds_flow: "20.0000",
          current_assets_closing: "200.0000", current_liabilities_closing: "80.0000",
        },
      ],
      grand_total: { working_capital_opening: "100.0000", working_capital_closing: "120.0000", funds_flow: "20.0000" },
    });
    renderPage(<FundsFlowMonthlyPage />);
    expect(await screen.findByText("Jul 2026")).toBeInTheDocument();
    expect(within(screen.getByTestId("funds-grand-total")).getByText("20.00")).toBeInTheDocument();
  });
});

describe("Ratio Analysis statement", () => {
  it("shows a dash and the reason for a ratio that cannot be worked out", async () => {
    h.api.getRatioAnalysis.mockResolvedValue({
      ...envelope("ratio_analysis"),
      principal_groups: [
        { code: "WORKING_CAPITAL", label: "Working Capital", amount: "100.0000", dr_cr: "Dr" },
        { code: "SUNDRY_DEBTORS_DUE", label: "Sundry Debtors due till today", amount: null, dr_cr: "", reason: "No authoritative due-date source yet." },
      ],
      principal_ratios: [
        { code: "CURRENT_RATIO", label: "Current Ratio", numerator: "200.0000", denominator: "100.0000", value: "2.0000", unit: "ratio", display: "2.00 : 1" },
        { code: "GROSS_PROFIT_PCT", label: "Gross Profit %", numerator: "10.0000", denominator: "0.0000", value: null, unit: "percent", display: "N/A", reason: "Sales are zero" },
      ],
    });
    renderPage(<RatioAnalysisStatementPage />);
    expect(await screen.findByText("Working Capital")).toBeInTheDocument();
    expect(screen.getByTestId("group-WORKING_CAPITAL")).toHaveTextContent("100.00 Dr");
    expect(screen.getByTestId("ratio-CURRENT_RATIO")).toHaveTextContent("2.00 : 1");
    const null1 = screen.getByTestId("ratio-GROSS_PROFIT_PCT");
    expect(null1).toHaveTextContent("—");
    expect(null1).not.toHaveTextContent("N/A");
    expect(within(null1).getByText("Sales are zero")).toBeInTheDocument();
    expect(screen.getByTestId("group-SUNDRY_DEBTORS_DUE")).toHaveTextContent("—");
    expect(screen.getByText("No authoritative due-date source yet.")).toBeInTheDocument();
    // No source in the answer: nothing is made up and the old "Choose the bill source" hint is gone.
    expect(screen.queryByTestId("total-open-SUNDRY_DEBTORS_DUE")).toBeNull();
    expect(screen.queryByTestId("source-SUNDRY_DEBTORS_DUE")).toBeNull();
    expect(screen.queryByTestId("source-hint-SUNDRY_DEBTORS_DUE")).toBeNull();
    expect(screen.queryByText(/Choose the bill source/)).toBeNull();
  });

  it("labels an automatically chosen bill source and says where to change it", async () => {
    h.api.getRatioAnalysis.mockResolvedValue({
      ...envelope("ratio_analysis"),
      principal_groups: [
        {
          code: "SUNDRY_DEBTORS_DUE",
          label: "Sundry Debtors due till today",
          amount: "1000.0000",
          dr_cr: "Dr",
          total_open: "1500.0000",
          source: "party_ledger",
          source_automatic: true,
          note: "Chosen automatically (no AR/AP source set in Settings): the party ledger when it is switched on, else outstanding bills.",
        },
        { code: "WORKING_CAPITAL", label: "Working Capital", amount: "100.0000", dr_cr: "Dr" },
      ],
      principal_ratios: [],
    });
    renderPage(<RatioAnalysisStatementPage />);
    const debtors = await screen.findByTestId("group-SUNDRY_DEBTORS_DUE");
    expect(screen.getByTestId("source-SUNDRY_DEBTORS_DUE")).toHaveTextContent("Source: Party ledgers (automatic)");
    expect(debtors).toHaveTextContent("Chosen automatically");
    expect(screen.getByTestId("source-hint-SUNDRY_DEBTORS_DUE")).toHaveTextContent(
      "Change the bill source in Settings → Configuration → Finance",
    );
    expect(screen.queryByTestId("source-hint-WORKING_CAPITAL")).toBeNull();
    expect(screen.queryByText(/Choose the bill source/)).toBeNull();
  });

  it("shows due till today, total open, the bill source and its note once a source is chosen", async () => {
    h.api.getRatioAnalysis.mockResolvedValue({
      ...envelope("ratio_analysis"),
      principal_groups: [
        {
          code: "SUNDRY_DEBTORS_DUE",
          label: "Sundry Debtors due till today",
          amount: "150000.0000",
          dr_cr: "Dr",
          total_open: "250000.0000",
          source: "outstanding_bills",
          source_automatic: false,
          note: "Amounts count only BDT bills; 2 open foreign-currency bill(s) are left out.",
        },
        {
          code: "SUNDRY_CREDITORS_DUE",
          label: "Sundry Creditors due till today",
          amount: "0.0000",
          dr_cr: "Cr",
          total_open: "0.0000",
          source: "party_ledger",
          note: null,
        },
      ],
      principal_ratios: [],
    });
    renderPage(<RatioAnalysisStatementPage />);
    const debtors = await screen.findByTestId("group-SUNDRY_DEBTORS_DUE");
    expect(debtors).toHaveTextContent("1,50,000.00 Dr");
    expect(screen.getByTestId("total-open-SUNDRY_DEBTORS_DUE")).toHaveTextContent("Total open: 2,50,000.00");
    expect(screen.getByTestId("source-SUNDRY_DEBTORS_DUE")).toHaveTextContent("Source: Outstanding bills");
    expect(debtors).toHaveTextContent("2 open foreign-currency bill(s) are left out.");
    // Chosen in Settings: no "(automatic)" label and no hint.
    expect(screen.getByTestId("source-SUNDRY_DEBTORS_DUE").textContent).toBe("Source: Outstanding bills");
    expect(screen.queryByTestId("source-hint-SUNDRY_DEBTORS_DUE")).toBeNull();
    expect(screen.getByTestId("source-SUNDRY_CREDITORS_DUE").textContent).toBe("Source: Party ledgers");
    expect(screen.queryByTestId("source-hint-SUNDRY_CREDITORS_DUE")).toBeNull();
  });
});

describe("Stock vs Ledger control report", () => {
  it("shows both totals and the difference as it is", async () => {
    h.api.getStockGlReconciliation.mockResolvedValue({
      ...envelope("stock_gl"),
      by_nature: [{ nature: "RAW_MATERIAL", fifo_value: "400.0000", line_count: 3 }],
      fifo_total: "400.0000", gl_total: "450.0000", difference: "50.0000", unclassified_stock: "0.0000",
      gl_ledgers: [{ account_id: 1, name: "Inventory - Fabric", group_id: 2, balance: "450.0000" }],
    });
    renderPage(<StockGlReconciliationPage />);
    await waitFor(() => expect(screen.getByTestId("fifo-total")).toHaveTextContent("400.00"));
    expect(screen.getByTestId("gl-total")).toHaveTextContent("450.00");
    expect(screen.getByTestId("stock-difference")).toHaveTextContent("50.00");
    expect(screen.getByText("Raw material")).toBeInTheDocument();
    expect(screen.getByText("Inventory - Fabric")).toBeInTheDocument();
  });
});
