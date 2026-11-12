// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BudgetAnalyticsResponse,
  DrilldownResponse,
  ExpenseAnalysisResponse,
  ExpenseControlsResponse,
} from "@/api/financeBudgetAnalytics";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  api: {
    getBudgetAnalytics: vi.fn(),
    getDrilldown: vi.fn(),
    exportBudgetAnalytics: vi.fn(),
    getExpenseAnalysis: vi.fn(),
    getExpenseControls: vi.fn(),
  },
  saveBlob: vi.fn(),
  getCommentary: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeBudgetAnalytics", () => ({ financeBudgetAnalyticsApi: h.api }));
vi.mock("@/api/financeAiInsights", async () => {
  const actual = await vi.importActual<typeof import("@/api/financeAiInsights")>("@/api/financeAiInsights");
  return { ...actual, financeAiInsightsApi: { getCommentary: h.getCommentary } };
});
vi.mock("@/lib/fileSave", () => ({ saveBlob: h.saveBlob }));

import { BudgetAnalyticsPage } from "./BudgetAnalyticsPage";
import { ExpenseAnalysisPage } from "./ExpenseAnalysisPage";
import { ExpenseControlsPage } from "./ExpenseControlsPage";

const BA_ME = {
  feature_flags: { finance_budget_analytics_v2: true, fiscal_year_start_month: 7 } as Record<string, unknown>,
  role_name: "accountant",
  role_permissions: {} as Record<string, unknown>,
};

function analytics(extra: Partial<BudgetAnalyticsResponse> = {}): BudgetAnalyticsResponse {
  return {
    report: "finance_budget_analytics",
    fiscal_year: "2026-27",
    fiscal_year_start: "2026-07-01",
    fiscal_year_end: "2027-06-30",
    dimension: "cost_center",
    base_currency: "BDT",
    enforcement_mode: "warn",
    budgets: [{ id: 4, budget_name: "FY27 Opex", status: "FINAL" }],
    rows: [
      { id: 1, label: "Factory", budget: "100.0000", actual: "90.0000", variance: "10.0000", variance_percent: "10.0000", used_percent: "90.0000", status: "warning" },
      { id: 2, label: "Head office", budget: "1000000.0000", actual: "1250000.0000", variance: "-250000.0000", variance_percent: "-25.0000", used_percent: "125.0000", status: "critical" },
      { id: null, label: "(No cost centre)", budget: "0.0000", actual: "500.0000", variance: "-500.0000", variance_percent: null, used_percent: null, status: "within" },
    ],
    totals: { budget: "1000100.0000", actual: "1250590.0000", variance: "-250490.0000", variance_percent: null, used_percent: "125.0464", status: "critical" },
    notes: ["Actual counts expense accounts plus any account named by a budget line, posted and in the books."],
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}

function drill(extra: Partial<DrilldownResponse> = {}): DrilldownResponse {
  return {
    report: "finance_budget_analytics_drilldown",
    fiscal_year: "2026-27",
    base_currency: "BDT",
    filters: {},
    total: "1250000.0000",
    line_count: 2,
    limit: 50,
    offset: 0,
    lines: [
      {
        voucher_line_id: 11, voucher_id: 501, voucher_number: "PV-0001", voucher_date: "2026-08-02", voucher_status: "POSTED",
        account_id: 9, account_number: "6100", account_name: "Rent", cost_center_id: 2, cost_center_name: "Head office",
        narration: "Office rent", entry_type: "DEBIT", base_amount: "1300000.0000", signed_amount: "1300000.0000",
      },
      {
        voucher_line_id: 12, voucher_id: 502, voucher_number: "JV-0007", voucher_date: "2026-09-01", voucher_status: "POSTED",
        account_id: 9, account_number: "6100", account_name: "Rent", cost_center_id: 2, cost_center_name: "Head office",
        narration: "Refund", entry_type: "CREDIT", base_amount: "50000.0000", signed_amount: "-50000.0000",
      },
    ],
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  // Only the clock is fake (financial year 2026-27); timers stay real so findBy* keeps working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0));
  h.me = { ...BA_ME };
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.saveBlob.mockReset();
  h.getCommentary.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Budget vs Actual (analytics) page", () => {
  it("shows the table with lakh/crore money, used %, status chips and a totals row", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    renderPage(<BudgetAnalyticsPage />);
    const rows = await screen.findAllByTestId("analytics-row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("12,50,000.00");
    expect(rows[1]).toHaveTextContent("(-)2,50,000.00");
    expect(rows[1]).toHaveTextContent("125.00%");
    expect(within(rows[0]!).getByTestId("status-warning")).toHaveTextContent("Warning");
    expect(within(rows[1]!).getByTestId("status-critical")).toHaveTextContent("Critical");
    expect(within(rows[2]!).getByTestId("status-within")).toHaveTextContent("Within");
    expect(rows[2]).toHaveTextContent("—");
    const totals = screen.getByTestId("analytics-totals");
    expect(totals).toHaveTextContent("12,50,590.00");
    expect(within(totals).getByTestId("status-critical")).toBeInTheDocument();
    expect(h.api.getBudgetAnalytics).toHaveBeenCalledWith({ fiscal_year: "2026-27", budget_id: undefined, dimension: "cost_center" });
  });

  it("opens the voucher lines of a row; their total equals the cell and vouchers link to the voucher page", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    h.api.getDrilldown.mockResolvedValue(drill());
    renderPage(<BudgetAnalyticsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Head office" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByTestId("drill-total")).toHaveTextContent("12,50,000.00"));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByRole("link", { name: "PV-0001" })).toHaveAttribute("href", "/app/accounts/vouchers/501");
    expect(within(dialog).getByText("(-)50,000.00")).toBeInTheDocument();
    expect(h.api.getDrilldown).toHaveBeenCalledWith({ fiscal_year: "2026-27", budget_id: undefined, cost_center_id: 2, limit: 50, offset: 0 });
  });

  it("asks for lines without a cost centre for the '(No cost centre)' row and pages with Next", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    h.api.getDrilldown.mockResolvedValue(drill({ total: "500.0000", line_count: 60, lines: drill().lines }));
    renderPage(<BudgetAnalyticsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "(No cost centre)" }));
    await waitFor(() => expect(h.api.getDrilldown).toHaveBeenCalledWith(expect.objectContaining({ no_cost_center: true, offset: 0 })));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(h.api.getDrilldown).toHaveBeenCalledWith(expect.objectContaining({ no_cost_center: true, offset: 50 })));
  });

  it("warns when the drill-down lines do not add up to the table figure", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    h.api.getDrilldown.mockResolvedValue(drill({ total: "1.0000" }));
    renderPage(<BudgetAnalyticsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Head office" }));
    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toHaveTextContent("do not add up");
  });

  it("exports the same table as CSV through saveBlob", async () => {
    const blob = new Blob(["a,b"]);
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    h.api.exportBudgetAnalytics.mockResolvedValue(blob);
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(h.saveBlob).toHaveBeenCalledWith(blob, "budget-analytics-cost_center-2026-27.csv"));
    expect(h.api.exportBudgetAnalytics).toHaveBeenCalledWith({ fiscal_year: "2026-27", budget_id: undefined, dimension: "cost_center" });
  });

  it("switches the CSV export off after a 403 and when the export permission is explicitly false", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    h.api.exportBudgetAnalytics.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled());
    expect(h.saveBlob).not.toHaveBeenCalled();
    cleanup();

    h.me = { ...BA_ME, role_permissions: { "finance.mis_report.export": false } };
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    const button = screen.getByRole("button", { name: "Export CSV" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "You do not have permission to export finance reports.");
  });

  it("shows the server's explanation when a dimension cannot be shown (422)", async () => {
    h.api.getBudgetAnalytics.mockImplementation((q: { dimension: string }) =>
      q.dimension === "department"
        ? Promise.reject(
            Object.assign(new Error("No cost centre has a department set, so a department view is not available."), { status: 422 }),
          )
        : Promise.resolve(analytics()),
    );
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    fireEvent.change(screen.getByLabelText(/Show by/), { target: { value: "department" } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This view cannot be shown");
    expect(alert).toHaveTextContent("No cost centre has a department set");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("lists the year's budgets and sends the chosen budget", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    fireEvent.change(screen.getByLabelText(/Budget/, { selector: "select" }), { target: { value: "4" } });
    await waitFor(() =>
      expect(h.api.getBudgetAnalytics).toHaveBeenLastCalledWith({ fiscal_year: "2026-27", budget_id: 4, dimension: "cost_center" }),
    );
  });

  it("shows a permission message for a 403", async () => {
    h.api.getBudgetAnalytics.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPage(<BudgetAnalyticsPage />);
    expect(await screen.findByText("You do not have permission to view finance reports.")).toBeInTheDocument();
  });

  it("does not call the API and explains when the switch is off", () => {
    h.me = { ...BA_ME, feature_flags: { finance_budget_analytics_v2: "true" } };
    renderPage(<BudgetAnalyticsPage />);
    expect(screen.getByText("Budget analytics is switched off")).toBeInTheDocument();
    expect(h.api.getBudgetAnalytics).not.toHaveBeenCalled();
  });

  it("shows 'Explain this report' only while finance AI is on, with the financial year", async () => {
    h.api.getBudgetAnalytics.mockResolvedValue(analytics());
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    expect(screen.queryByRole("button", { name: "Explain this report" })).toBeNull();
    cleanup();

    h.me = { ...BA_ME, feature_flags: { ...BA_ME.feature_flags, finance_ai_insights_v2: true } };
    h.getCommentary.mockResolvedValue({
      report: "budget_analytics", summary: "Spend is above budget.", findings: [], source: "deterministic",
      deterministic_fallback: false, reason: null, facts: [], period: { comparison: "none" }, base_currency: "BDT",
      notes: [], data_as_of: "2026-11-12T10:00:00",
    });
    renderPage(<BudgetAnalyticsPage />);
    await screen.findAllByTestId("analytics-row");
    fireEvent.click(screen.getByRole("button", { name: "Explain this report" }));
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    expect(await screen.findByText("Spend is above budget.")).toBeInTheDocument();
    expect(h.getCommentary).toHaveBeenCalledWith({ report: "budget_analytics", fiscal_year: 2026, comparison: "none" });
  });
});

function expense(groupBy: ExpenseAnalysisResponse["group_by"]): ExpenseAnalysisResponse {
  return {
    report: "finance_expense_analysis",
    from_date: "2026-07-01",
    to_date: "2027-06-30",
    previous_from_date: "2025-07-01",
    previous_to_date: "2026-06-30",
    group_by: groupBy,
    base_currency: "BDT",
    expense_classes: ["INDIRECT_EXPENSES"],
    rows:
      groupBy === "vendor"
        ? [{ id: 8, label: "Acme Fabrics", current: "300.0000", previous: "100.0000", change: "200.0000", change_percent: "200.0000" }]
        : [{ id: "2026-07", label: "Jul 2026", current: "150.0000", previous: "0.0000", change: "150.0000", change_percent: null }],
    by_class: [{ statement_class: "INDIRECT_EXPENSES", current: "300.0000", previous: "100.0000" }],
    total_current: "300.0000",
    total_previous: "100.0000",
    change: "200.0000",
    change_percent: "200.0000",
    warnings: [{ code: "UNCLASSIFIED_EXPENSE", message: "Some accounts have no statement class.", current: "10.0000", previous: "0.0000", account_count: 1 }],
    notes: [],
    data_as_of: "2026-11-12T10:00:00",
  };
}

describe("Expense analysis page", () => {
  it("shows current vs previous with change %, the class summary and the warnings", async () => {
    h.api.getExpenseAnalysis.mockImplementation((q: { group_by: ExpenseAnalysisResponse["group_by"] }) => Promise.resolve(expense(q.group_by)));
    renderPage(<ExpenseAnalysisPage />);
    const row = await screen.findByTestId("expense-row");
    expect(row).toHaveTextContent("Jul 2026");
    expect(row).toHaveTextContent("—");
    expect(screen.getByTestId("expense-totals")).toHaveTextContent("200.00%");
    expect(screen.getByText("Indirect expenses")).toBeInTheDocument();
    expect(screen.getByText("Some accounts have no statement class.")).toBeInTheDocument();
    expect(h.api.getExpenseAnalysis).toHaveBeenCalledWith({ from_date: "2026-07-01", to_date: "2027-06-30", group_by: "month" });
  });

  it("switches the grouping", async () => {
    h.api.getExpenseAnalysis.mockImplementation((q: { group_by: ExpenseAnalysisResponse["group_by"] }) => Promise.resolve(expense(q.group_by)));
    renderPage(<ExpenseAnalysisPage />);
    await screen.findByTestId("expense-row");
    fireEvent.change(screen.getByLabelText(/Group by/), { target: { value: "vendor" } });
    expect(await screen.findByText("Acme Fabrics")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vendor" })).toBeInTheDocument();
    expect(h.api.getExpenseAnalysis).toHaveBeenLastCalledWith(expect.objectContaining({ group_by: "vendor" }));
  });
});

function controls(): ExpenseControlsResponse {
  return {
    report: "finance_expense_controls",
    as_of_date: "2026-11-12",
    fiscal_year: "2026-27",
    base_currency: "BDT",
    enforcement_mode: "warn",
    rules: [
      {
        code: "REPEATED_AMOUNT",
        label: "Same account, amount and party / narration repeated within days",
        severity: "medium",
        count: 3,
        amount: "1500000.0000",
        note: "Only the newest 5000 lines were checked.",
        items: [
          {
            code: "REPEATED_AMOUNT",
            severity: "medium",
            title: "Rent 5,00,000 paid 3 times",
            amount: "1500000.0000",
            account_id: 9,
            voucher_ids: [501, 502],
            evidence: { unit_amount: "500000.0000", occurrences: 3, dates: ["2026-10-01", "2026-10-03"] },
          },
        ],
      },
      { code: "MISSING_COST_CENTRE", label: "Expense lines without a cost centre", severity: "low", count: 0, amount: "0.0000", items: [] },
    ],
    data_as_of: "2026-11-12T10:00:00",
  };
}

describe("Expense controls page", () => {
  it("shows each rule with severity, count, amount and note; expands to items with evidence and voucher links", async () => {
    h.api.getExpenseControls.mockResolvedValue(controls());
    renderPage(<ExpenseControlsPage />);
    const card = await screen.findByTestId("rule-REPEATED_AMOUNT");
    expect(card).toHaveTextContent("Medium");
    expect(within(card).getByTestId("rule-count-REPEATED_AMOUNT")).toHaveTextContent("3");
    expect(card).toHaveTextContent("15,00,000.00");
    expect(card).toHaveTextContent("Only the newest 5000 lines were checked.");
    expect(within(card).queryByTestId("control-item")).toBeNull();

    const toggle = within(card).getByRole("button", { name: "Show items" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(within(card).getByRole("button", { name: "Hide items" })).toHaveAttribute("aria-expanded", "true");
    const item = within(card).getByTestId("control-item");
    expect(item).toHaveTextContent("Rent 5,00,000 paid 3 times");
    expect(item).toHaveTextContent("Amount each time:5,00,000.00");
    expect(item).toHaveTextContent("Dates:2026-10-01, 2026-10-03");
    expect(within(item).getByRole("link", { name: "#501" })).toHaveAttribute("href", "/app/accounts/vouchers/501");
    expect(card).toHaveTextContent("Showing the first 1 of 3 items");

    const clear = screen.getByTestId("rule-MISSING_COST_CENTRE");
    expect(within(clear).getByRole("button", { name: "All clear" })).toBeDisabled();
  });

  it("asks for the chosen as-of date", async () => {
    h.api.getExpenseControls.mockResolvedValue(controls());
    renderPage(<ExpenseControlsPage />);
    await screen.findByTestId("rule-REPEATED_AMOUNT");
    fireEvent.change(screen.getByLabelText(/As of/), { target: { value: "2026-09-30" } });
    await waitFor(() => expect(h.api.getExpenseControls).toHaveBeenLastCalledWith({ as_of_date: "2026-09-30" }));
  });
});
