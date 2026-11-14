// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetForecastResponse, ExceptionItem, MpAccess, SummaryResponse } from "@/api/mgmtPerformance";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  api: {
    getAccess: vi.fn(),
    getSummary: vi.fn(),
    getCash: vi.fn(),
    getBudgetForecast: vi.fn(),
    getExceptions: vi.fn(),
    actOnException: vi.fn(),
    requestRevision: vi.fn(),
    scanExceptions: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/mgmtPerformance", () => ({ mgmtPerformanceApi: h.api }));

import { ManagementPerformancePage } from "./ManagementPerformancePage";

const COMPANY: MpAccess = { allowed: true, company: true, cost_center_ids: [], can_setup: true, can_review: true, user_id: 1 };
const OWNER: MpAccess = { allowed: true, company: false, cost_center_ids: [7], can_setup: false, user_id: 3 };

function summary(): SummaryResponse {
  return {
    period: { kind: "month", label: "2026-11", start: "2026-11-01", end: "2026-11-30", today: "2026-11-14" },
    base_currency: "BDT",
    accounting_profit: { from_date: "2026-11-01", to_date: "2026-11-30", gross_result: "0", nett_result: "-1500.0000", income_expense_movement: "-1500", balanced: true, value_class: "ACTUAL" },
    fg_contribution: { value: "220000.0000", direct_cost: "143000.0000", contribution: "77000.0000", contribution_pct: "35.0000", unallocated_landed_selling: "1000.0000", net_contribution: "76000.0000", counted_qty: "200.0000", orders: 1, unknown_orders: 0, value_class: "ESTIMATED" },
    opex: { budget: "100000.0000", actual: "40000.0000", committed: "0.0000", forecast: "90000.0000" },
    forecast_result: { so_far: "-14000.0000", with_pipeline: "5000.0000", value_class: "FORECAST" },
    budget_status_counts: { FAILED: 1, WARNING: 2 },
    targets: {
      opex_forecast: "90000.0000", contingency: "0", target_profit: "0", unallocated_landed_selling: "1000", fg_contribution: "77000",
      pipeline_contribution: "19000", required_contribution: "14000", expected_contribution_pct: "35.0000",
      expected_contribution_pct_source: "FINISHED_GOODS_THIS_PERIOD", contribution_per_piece: "385.0000",
      break_even_value: "260000.0000", profit_target_value: "260000.0000", remaining_production_value: "40000.0000",
      remaining_production_pieces: "36.3600", marketing_gap_value: "0.0000", result_so_far: "-14000", result_with_pipeline: "5000",
      gap_status: "PIPELINE_COVERS", targets_set_months: [], reason_codes: ["TARGET_NOT_SET"],
    },
    reason_codes: ["TARGET_NOT_SET"],
    notes: ["Accounting profit = posted vouchers only."],
  };
}

function forecast(): BudgetForecastResponse {
  return {
    period: { kind: "month", label: "2026-11", start: "2026-11-01", end: "2026-11-30" },
    base_currency: "BDT",
    scope: "own_cost_centres",
    rows: [
      {
        cost_center_id: 7, cost_center_label: "CC7 - Cutting", department: null, owner_user_id: 3, category: "UTILITIES",
        category_label: "Electricity, gas, water, internet", budget: "1000.0000", actual: "1100.0000", committed: "0.0000",
        forecast: "1100.0000", variance: "-100.0000", used_pct: "110.0000", run_rate: null, history_avg: "0", warning_pct: "90.0000",
        status: "FAILED", sources: ["BUDGET_TIME_PHASED"], restricted: false, budget_line_ids: [11],
        months: [{ month: "2026-11", kind: "current", budget: "1000.0000", actual: "1100.0000", committed: "0", forecast: "1100.0000", source: "BUDGET_TIME_PHASED" }],
      },
      {
        cost_center_id: 7, cost_center_label: "CC7 - Cutting", department: null, owner_user_id: 3, category: "PAYROLL",
        category_label: "Salary", budget: null, actual: null, committed: null, forecast: null, variance: null, used_pct: null,
        run_rate: null, history_avg: null, warning_pct: "90.0000", status: "OK", sources: [], restricted: true, budget_line_ids: [], months: [],
      },
    ],
    unmapped: [],
    status_counts: { FAILED: 1 },
    totals: { budget: "1000.0000", actual: "1100.0000", committed: "0.0000", forecast: "1100.0000" },
    payroll: null,
    committed_unmapped_lines: null,
    budgets_used: [],
    thresholds: {},
    reason_codes: [],
    notes: [],
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ManagementPerformancePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.me = { feature_flags: { mgmt_performance_v1: true } };
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.getCash.mockResolvedValue({ financing_gap: { week_index: 2, week_start: "2026-11-28", shortfall: "50000.0000" }, weeks: [] });
});
afterEach(() => cleanup());

describe("Management Performance page", () => {
  it("is switched off without the strict flag and calls nothing", () => {
    h.me = { feature_flags: { mgmt_performance_v1: "true" } };
    renderAt("/app/finance/management-performance");
    expect(screen.getByText("Management performance is switched off")).toBeInTheDocument();
    expect(h.api.getAccess).not.toHaveBeenCalled();
  });

  it("overview keeps posted profit and estimates apart with their labels", async () => {
    h.api.getAccess.mockResolvedValue(COMPANY);
    h.api.getSummary.mockResolvedValue(summary());
    renderAt("/app/finance/management-performance");
    expect(await screen.findByText("Accounting profit")).toBeInTheDocument();
    expect(screen.getByText("Actual - posted")).toBeInTheDocument();
    expect(screen.getAllByText("Estimate - not posted").length).toBeGreaterThan(0);
    expect(screen.getByText("-1,500.00")).toBeInTheDocument();
    expect(await screen.findByText("50,000.00")).toBeInTheDocument(); // cash gap
    expect(screen.getByText(/No monthly profit target is set/)).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(8);
  });

  it("a cost-centre owner sees only budget views; payroll is restricted; Actions menu offers a budget change", async () => {
    h.api.getAccess.mockResolvedValue(OWNER);
    h.api.getBudgetForecast.mockResolvedValue(forecast());
    h.api.requestRevision.mockResolvedValue({ id: 5 });
    renderAt("/app/finance/management-performance?view=cash");
    const [first, second] = await screen.findAllByTestId("forecast-row");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Budget forecast", "Exceptions", "Budget revisions"]);
    expect(h.api.getSummary).not.toHaveBeenCalled();
    expect(within(first!).getByText("Over budget")).toBeInTheDocument();
    expect(within(second!).getByText(/Payroll amounts are restricted/)).toBeInTheDocument();
    fireEvent.click(within(first!).getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Request budget change" }));
    const dialog = screen.getByRole("dialog");
    const send = within(dialog).getByRole("button", { name: "Send for approval" });
    expect(send).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/New amount/), { target: { value: "1500" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Summer tariff" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.api.requestRevision).toHaveBeenCalledTimes(1));
    const body = h.api.requestRevision.mock.calls[0]?.[0];
    expect(body).toMatchObject({ kind: "CHANGE", budget_line_id: 11, new_amount: "1500", reason: "Summer tariff" });
    expect(body.request_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("an owner answers an exception with one request id", async () => {
    const item: ExceptionItem = {
      id: 9, period_month: "2026-11", cost_center_id: 7, cost_center_label: "CC7 - Cutting", owner_user_id: 3, category: "UTILITIES",
      category_label: "Utilities", account_id: null, family: "BUDGET", severity: "FAILED", status: "OPEN", budget_amount: "1000.0000",
      actual_amount: "1100.0000", forecast_amount: "1100.0000", revised_forecast: null, reason: null, corrective_action: null,
      review_note: null, decision_note: null, restricted: false, can_respond: true, can_review: false, can_decide: false,
    };
    h.api.getAccess.mockResolvedValue(OWNER);
    h.api.getExceptions.mockResolvedValue({ items: [item], total: 1, limit: 200, offset: 0 });
    h.api.actOnException.mockResolvedValue({ id: 9, status: "RESPONDED", replay: false });
    renderAt("/app/finance/management-performance?view=exceptions");
    const row = await screen.findByTestId("exception-row");
    expect(screen.queryByRole("button", { name: "Check budgets now" })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Answer" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Why is this over/), { target: { value: "Diesel for the generator" } });
    fireEvent.change(within(dialog).getByLabelText(/What will you do/), { target: { value: "Repair the grid line" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.api.actOnException).toHaveBeenCalledTimes(1));
    const [id, action, body] = h.api.actOnException.mock.calls[0] ?? [];
    expect([id, action]).toEqual([9, "respond"]);
    expect(body).toMatchObject({ reason: "Diesel for the generator", corrective_action: "Repair the grid line" });
  });

  it("shows a plain message when the user has no access", async () => {
    h.api.getAccess.mockResolvedValue({ allowed: false, company: false, cost_center_ids: [] });
    renderAt("/app/finance/management-performance");
    expect(await screen.findByText(/You do not have access/)).toBeInTheDocument();
  });
});
