// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/core";
import type { CashRequirementResponse, CostListResponse, MoneyValue, OrderCost, OrderCostDetail } from "@/api/mfgCostCash";

const mp = vi.hoisted(() => ({
  getPlanningPermissions: vi.fn(),
  getTentativeDemand: vi.fn(),
  getPlanningSettings: vi.fn(),
  putPlanningSettings: vi.fn(),
  listBookings: vi.fn(),
  listRevisions: vi.fn(),
  getConflicts: vi.fn(),
}));

const mi = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getCapacity: vi.fn(),
  getLineLoading: vi.fn(),
  getReadiness: vi.fn(),
  getDeliveryPrediction: vi.fn(),
}));

const cc = vi.hoisted(() => ({
  listCostAtCompletion: vi.fn(),
  getOrderCostAtCompletion: vi.fn(),
  getCashRequirement: vi.fn(),
}));

const clientApi = vi.hoisted(() => ({
  listSewingLines: vi.fn(),
  listProductionShifts: vi.fn(),
  listInquiries: vi.fn(),
  listQuotations: vi.fn(),
}));

vi.mock("@/api/mfgPlanning", () => ({ mfgPlanningApi: mp }));
vi.mock("@/api/manufacturingIntelligence", () => ({ manufacturingIntelligenceApi: mi }));
vi.mock("@/api/mfgCostCash", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/mfgCostCash")>()), mfgCostCashApi: cc }));
vi.mock("@/api/client", () => ({ api: clientApi, getTenantId: () => "1" }));

import { ManufacturingIntelligenceSection } from "../ManufacturingIntelligenceSection";
import { TentativeDemandTab } from "../phase2/TentativeDemandTab";
import { CostCashTab } from "./CostCashTab";

const mv = (amount: string | null, value_class = "ESTIMATED", extra: Partial<MoneyValue> = {}): MoneyValue => ({
  amount,
  value_class,
  source: null,
  currency: null,
  source_amount: null,
  rate: null,
  rate_source: null,
  reason_codes: [],
  missing_inputs: [],
  ...extra,
});

const orderCost: OrderCost = {
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  order_qty: "1000.000",
  delivery_date: "2026-12-20",
  base_currency: "BDT",
  status: "PARTIAL",
  reason_codes: ["CPM_UNKNOWN"],
  missing_inputs: ["order_quantity"],
  revenue: { gross: mv("120000.0000"), commission: mv("2000.0000"), net: mv("118000.0000", "ESTIMATED", { source: "SNAPSHOT_QUOTED" }) },
  budget: {
    usable: true,
    source: "QUOTATION_BUDGET",
    value_class: "ESTIMATED",
    currency: "USD",
    rate: "110",
    rate_source: "QUOTATION_EXCHANGE_RATE",
    scale_factor: "1.0000",
    scaled: { revenue: "120000.0000", material: "60000.0000", cm: "20000.0000", other: "5000.0000" },
    unscaled: { revenue: "120000.0000", material: "60000.0000", cm: "20000.0000", other: "5000.0000" },
    reason_codes: ["BUDGET_SCALED"],
  },
  material: {
    procured: mv("40000.0000", "COMMITTED"),
    budget: mv("60000.0000"),
    remaining: mv("20000.0000"),
    eac: mv("60000.0000"),
    po_lines: 3,
    po_lines_unknown_fx: 1,
    bom_id: 9,
  },
  conversion: {
    smv: "12.5000",
    smv_source: "OB",
    sah_minutes: "12500.0000",
    cpm: null,
    cpm_source: null,
    eac: mv("20000.0000", "ESTIMATED", { reason_codes: ["CONVERSION_FROM_BUDGET_CM"] }),
    budget_cm: "20000.0000",
    variance_vs_budget_cm: null,
  },
  other: mv("5000.0000"),
  progress: {
    p: "0.4500",
    source: "HOURLY_SEWING_GOOD_QTY",
    sewing_good_qty: "450.000",
    plan_completed_qty: null,
    produced_qty: null,
    earned_conversion: "9000.0000",
    remaining_conversion: "11000.0000",
  },
  eac: mv("85000.0000"),
  margin: { amount: "33000.0000", margin_pct: "27.9661", basis: "NET_REVENUE", value_class: "ESTIMATED" },
  unknown_by_currency: { EUR: "300.0000" },
  gl_actual: null,
  finance_link: "/app/finance/profitability/entity?kind=order&id=5",
};

const lossOrder: OrderCost = {
  ...orderCost,
  order_id: 6,
  order_code: "ORD-6",
  status: "COMPLETE_DATA",
  margin: { amount: "-1500.0000", margin_pct: "-2.5000", basis: "NET_REVENUE", value_class: "ESTIMATED" },
};

const costList: CostListResponse = {
  base_currency: "BDT",
  items: [orderCost, lossOrder],
  total: 2,
  limit: 50,
  offset: 0,
  totals: { revenue_net: "236000.0000", eac: "170000.0000", margin: "66000.0000", margin_pct: "27.9661", orders_counted: 2, orders_excluded: 0 },
  cpm: { value: null, source: null, period_start: null, period_end: null, cm_total: null, earned_minutes: null, reason_codes: ["CPM_UNKNOWN"], warnings: [] },
  assumptions: ["Estimate - not posted. Nothing here is an accounting entry."],
};

const orderDetail: OrderCostDetail = {
  ...orderCost,
  gl_actual: {
    value_class: "ACTUAL",
    source: "FINANCE_ORDER_PROFITABILITY",
    revenue: "50000.0000",
    material: "45000.0000",
    cm: "0.0000",
    other: "0.0000",
    overhead: "0.0000",
    finance_cost: "0.0000",
    direct_voucher_lines: 4,
    reason_codes: ["GL_MATERIAL_EXCEEDS_PROCURED"],
    note: "Informational only; never added to the estimate at completion.",
  },
  cpm_detail: {
    value: null,
    source: null,
    period_start: "2026-08-01",
    period_end: "2026-10-31",
    cm_total: "0.0000",
    earned_minutes: "0.0000",
    reason_codes: ["CPM_UNKNOWN", "CPM_NO_CM_POSTING"],
    warnings: [{ code: "CPM_UNCODED_DIRECT_EXPENSES", amount: "1200.0000" }],
  },
  assumptions: ["Ledger (GL) order cost is shown for information only and never added to the estimate."],
};

const week = (i: number, closing: string, below = false) => ({
  week_index: i,
  week_start: `2026-11-${String(13 + 7 * i).padStart(2, "0")}`,
  week_end: `2026-11-${String(19 + 7 * i).padStart(2, "0")}`,
  opening: "1000.0000",
  inflow: "0.0000",
  outflow: "500.0000",
  net: "-500.0000",
  closing,
  below_zero: below,
  by_category: { BTB_MATURITY: "300.0000", PAYROLL_NET: "200.0000" },
});

const cash: CashRequirementResponse = {
  date_from: "2026-11-13",
  date_to: "2026-11-26",
  horizon_days: 14,
  base_currency: "BDT",
  value_class: "FORECAST",
  settings: { export_document_days: 7, export_usance_days: 90, btb_usance_days: 120 },
  opening: {
    cash_in_hand: "200.0000",
    bank: "1300.0000",
    bank_od: "-500.0000",
    excluding_overdraft: "1500.0000",
    including_overdraft: "1000.0000",
    basis: "NET_OF_DRAWN_OVERDRAFT",
    source: "FINANCE_POOL_BALANCES_BY_CLASS",
  },
  totals: { inflow: "0.0000", outflow: "1000.0000", net: "-1000.0000", closing: "0.0000" },
  weeks: [week(0, "500.0000"), week(1, "-250.0000", true)],
  financing_gap: { week_index: 1, week_start: "2026-11-20", shortfall: "250.0000" },
  facility_headroom: { amount: "75000.0000", facilities: 2, unknown_by_currency: {}, note: "Available financing (memo) - never added to cash." },
  undated: { inflow: "0.0000", outflow: "0.0000", rows: 0 },
  beyond_horizon_rows: 0,
  unknown_by_currency: [{ direction: "OUT", category: "AP_BILL", currency: "EUR", source_amount: "900.0000", rows: 1 }],
  rows: [
    {
      direction: "OUT",
      category: "BTB_MATURITY",
      source_type: "btb_lc",
      source_id: 3,
      reference: "BTB-0003",
      due_date: "2026-11-10",
      date_rule: "BTB_LC_MATURITY",
      confidence: "CONTRACTUAL",
      value_class: "FORECAST",
      currency: "USD",
      source_amount: "3.0000",
      rate: "100",
      rate_source: "BTB_LC_EXCHANGE_RATE",
      amount: "300.0000",
      week_index: 0,
      overdue: true,
      reason_codes: ["OVERDUE"],
    },
  ],
  row_count: 2500,
  truncated: true,
  max_rows: 2000,
  reason_codes: ["FINANCING_GAP", "OVERDUE_IN_WEEK_1"],
  notes: [
    "STALE_PAYABLES: 2 posted vendor bill(s) more than 90 days past due with unknown payment status are left out of the cash totals; review them in accounts payable.",
    "Overdue items are shown in week 1.",
  ],
};

const perms = (can_view_finance?: boolean) => ({
  can_propose: true,
  can_manage_tentative: true,
  can_manage_assignments: true,
  can_approve: true,
  can_manage_settings: true,
  can_edit_style_smv: true,
  can_allocate: true,
  is_admin_or_manager: false,
  four_eyes: false,
  ...(can_view_finance === undefined ? {} : { can_view_finance }),
});

const withRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mi.getSummary.mockReturnValue(new Promise(() => {}));
  mi.getCapacity.mockReturnValue(new Promise(() => {}));
  mi.getLineLoading.mockReturnValue(new Promise(() => {}));
  mp.getPlanningPermissions.mockResolvedValue(perms(true));
  clientApi.listSewingLines.mockResolvedValue([]);
  clientApi.listProductionShifts.mockResolvedValue([]);
  cc.listCostAtCompletion.mockResolvedValue(costList);
  cc.getOrderCostAtCompletion.mockResolvedValue(orderDetail);
  cc.getCashRequirement.mockResolvedValue(cash);
  mp.getPlanningSettings.mockResolvedValue({
    stage_probability: { INQUIRY: null, QUOTATION: null },
    tentative_default_expiry_days: 30,
    receipt_buffer_days: 0,
    is_default: true,
    export_document_days: 7,
    export_usance_days: 90,
    btb_usance_days: 120,
    cpm_override: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("Cost & cash tab gating", () => {
  it("has no tab and fetches no permissions while the Phase 3 flags are off", () => {
    withRouter(<ManufacturingIntelligenceSection enabled />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(mp.getPlanningPermissions).not.toHaveBeenCalled();
  });

  it("hides the tab when the user may not see money (can_view_finance false)", async () => {
    mp.getPlanningPermissions.mockResolvedValue(perms(false));
    withRouter(<ManufacturingIntelligenceSection enabled phase3={{ cost: true, cash: true }} />);
    await waitFor(() => expect(mp.getPlanningPermissions).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "Cost & cash" })).toBeNull();
    expect(cc.listCostAtCompletion).not.toHaveBeenCalled();
  });

  it("hides the tab when the hint is missing (older backend)", async () => {
    mp.getPlanningPermissions.mockResolvedValue(perms(undefined));
    withRouter(<ManufacturingIntelligenceSection enabled phase3={{ cost: true, cash: false }} />);
    await waitFor(() => expect(mp.getPlanningPermissions).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "Cost & cash" })).toBeNull();
  });

  it("shows the tab with a flag and finance access, and loads only the switched-on part", async () => {
    const user = userEvent.setup();
    withRouter(<ManufacturingIntelligenceSection enabled phase3={{ cost: true, cash: false }} />);
    const tab = await screen.findByRole("tab", { name: "Cost & cash" });
    await user.click(tab);
    expect(await screen.findByTestId("mfg-costcash-tab")).toBeTruthy();
    expect(screen.getByTestId("mfg-money-not-posted").textContent).toBe("Estimate / forecast - not posted to the accounts");
    await screen.findByRole("table", { name: "Order cost at completion" });
    expect(cc.getCashRequirement).not.toHaveBeenCalled();
    expect(screen.queryByTestId("mfg-cash-requirement")).toBeNull();
  });
});

describe("Order cost at completion", () => {
  it("lists orders with value classes, margin %, a loss in red and a totals row", async () => {
    withRouter(<CostCashTab flags={{ cost: true, cash: false }} />);
    const table = await screen.findByRole("table", { name: "Order cost at completion" });
    expect(cc.listCostAtCompletion).toHaveBeenCalledWith({ status: undefined, limit: 50, offset: 0 });
    const row = within(table).getByText("ORD-5").closest("tr")!;
    expect(within(row).getByText("Partial data")).toBeTruthy();
    expect(within(row).getByText("118,000")).toBeTruthy();
    expect(within(row).getByText("33,000")).toBeTruthy();
    expect(within(row).getByText("28%")).toBeTruthy();
    expect(within(row).getByText("45%")).toBeTruthy();
    expect(within(row).getAllByText("Estimate").length).toBeGreaterThanOrEqual(3);
    const loss = within(table).getByText("ORD-6").closest("tr")!;
    expect(within(loss).getByText("-1,500").className).toContain("text-red-700");
    const totals = screen.getByTestId("mfg-cost-totals-row");
    expect(within(totals).getByText("236,000")).toBeTruthy();
    expect(within(totals).getByText("66,000")).toBeTruthy();
  });

  it("opens the single-order breakdown from the row Actions menu, with the ledger label and finance link", async () => {
    const user = userEvent.setup();
    withRouter(<CostCashTab flags={{ cost: true, cash: false }} />);
    const table = await screen.findByRole("table", { name: "Order cost at completion" });
    const row = within(table).getByText("ORD-5").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "View details" }));
    const dialog = await screen.findByRole("dialog", { name: /ORD-5/ });
    expect(cc.getOrderCostAtCompletion).toHaveBeenCalledWith(5);
    const gl = await within(dialog).findByTestId("mfg-gl-actual");
    expect(within(gl).getByText("From the ledger - for information, not part of the estimate")).toBeTruthy();
    expect(within(gl).getByText("Actual")).toBeTruthy();
    expect(within(dialog).getByTestId("mfg-cost-buckets")).toBeTruthy();
    expect(within(dialog).getByTestId("mfg-cpm-detail").textContent).toContain("Some direct expenses are not coded as factory cost");
    expect(within(dialog).getByTestId("mfg-cost-missing").textContent).toContain("300 EUR");
    const link = within(dialog).getByRole("link", { name: "Open order profitability in Finance" });
    expect(link.getAttribute("href")).toBe("/app/finance/profitability/entity?kind=order&id=5");
  });

  it("explains a 403 (no finance access) without showing figures", async () => {
    cc.listCostAtCompletion.mockRejectedValue(new ApiError("Forbidden", 403));
    withRouter(<CostCashTab flags={{ cost: true, cash: false }} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/finance access/);
    expect(screen.queryByRole("table", { name: "Order cost at completion" })).toBeNull();
  });

  it("explains a 404 (switched off)", async () => {
    cc.listCostAtCompletion.mockRejectedValue(new ApiError("Not found", 404));
    withRouter(<CostCashTab flags={{ cost: true, cash: false }} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/switched off/);
  });
});

describe("Cash requirement", () => {
  it("shows net cash, the financing gap, weeks below zero, headroom memo, notes and the truncation notice", async () => {
    const user = userEvent.setup();
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} />);
    const gap = await screen.findByTestId("mfg-financing-gap");
    expect(gap.textContent).toContain("week 2");
    expect(gap.textContent).toContain("250");
    expect(cc.getCashRequirement).toHaveBeenCalledWith(expect.objectContaining({ horizon_days: 90 }));
    expect(screen.getByTestId("mfg-cash-opening").textContent).toContain("Drawn bank overdraft");
    const weeks = screen.getByRole("table", { name: "Weekly cash requirement" });
    expect(within(weeks).getAllByRole("row")).toHaveLength(3);
    const below = screen.getByTestId("mfg-cash-week-below-zero");
    expect(below.className).toContain("bg-red-50");
    expect(within(below).getByText("Below zero")).toBeTruthy();
    await user.click(within(below).getByRole("button", { name: /Show 2 categories/ }));
    expect(within(weeks).getByText("BTB LC payment")).toBeTruthy();
    expect(screen.getByTestId("mfg-facility-headroom").textContent).toContain("75,000");
    expect(screen.getByTestId("mfg-facility-headroom").textContent).toContain("memo, not cash");
    expect(screen.getByTestId("mfg-cash-notes").textContent).toContain("Old unpaid supplier bills left out");
    expect(screen.getByTestId("mfg-cash-unknown-fx").textContent).toContain("900 EUR");
    expect(screen.getByTestId("mfg-cash-truncated").textContent).toContain("first 1 of 2500");
    const items = screen.getByRole("table", { name: "Cash items" });
    expect(within(items).getByText("BTB-0003")).toBeTruthy();
    expect(within(items).getByText("Overdue")).toBeTruthy();
    expect(within(items).getByText("Contract date")).toBeTruthy();
  });

  it("warns when a data source hit its row cap (forecast incomplete)", async () => {
    cc.getCashRequirement.mockResolvedValue({ ...cash, forecast_complete: false, reason_codes: [...cash.reason_codes, "SOURCE_TRUNCATED:GRN_NOT_BILLED"] });
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} integratedOn />);
    const banner = await screen.findByTestId("mfg-cash-incomplete");
    expect(banner.textContent).toContain("Forecast incomplete");
    expect(banner.textContent).toContain("Grn not billed");
  });

  it("validates the horizon before asking the server", async () => {
    const user = userEvent.setup();
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} />);
    await screen.findByTestId("mfg-financing-gap");
    const horizon = screen.getByLabelText("Horizon (days)");
    await user.clear(horizon);
    await user.type(horizon, "200");
    await user.click(screen.getByRole("button", { name: "Show forecast" }));
    expect((await screen.findByText(/between 1 and 180 days/)).textContent).toBeTruthy();
    expect(cc.getCashRequirement).toHaveBeenCalledTimes(1);
  });

  it("explains a 404 (switched off)", async () => {
    cc.getCashRequirement.mockRejectedValue(new ApiError("Not found", 404));
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Cash requirement is switched off/);
  });
});

describe("Planning settings: Cost & cash timing", () => {
  const base = { stage_probability: { INQUIRY: null, QUOTATION: "50.00" }, tentative_default_expiry_days: 30, receipt_buffer_days: 2, is_default: false };

  beforeEach(() => {
    mp.getTentativeDemand.mockResolvedValue({ items: [], total: 0, limit: 200, offset: 0, counted_count: 0, counted_total_smv_minutes: null, counted_weighted_smv_minutes: null });
  });

  it("shows no Phase 3 fields while the flags are off", async () => {
    mp.getPlanningSettings.mockResolvedValue(base);
    withRouter(<TentativeDemandTab />);
    await screen.findByLabelText("Default expiry (days)");
    expect(screen.queryByTestId("mfg-settings-phase3")).toBeNull();
  });

  it("lets a finance-cleared approver edit and sends the Phase 3 keys", async () => {
    mp.getPlanningSettings.mockResolvedValue({ ...base, export_document_days: 7, export_usance_days: 90, btb_usance_days: 120, cpm_override: null });
    mp.putPlanningSettings.mockResolvedValue({});
    const user = userEvent.setup();
    withRouter(<TentativeDemandTab phase3On canViewFinance />);
    const usance = await screen.findByLabelText("Export usance days");
    await user.clear(usance);
    await user.type(usance, "60");
    await user.type(screen.getByLabelText("Cost per minute override"), "2.5");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mp.putPlanningSettings).toHaveBeenCalled());
    expect(mp.putPlanningSettings.mock.calls[0]![0]).toMatchObject({
      export_document_days: 7,
      export_usance_days: 60,
      btb_usance_days: 120,
      cpm_override: "2.5",
    });
  });

  it("shows read-only values and hides the CPM without finance access, and never sends Phase 3 keys", async () => {
    mp.getPlanningSettings.mockResolvedValue({
      ...base,
      export_document_days: 7,
      export_usance_days: 90,
      btb_usance_days: 120,
      cpm_override: null,
      cpm_override_hidden: true,
    });
    mp.putPlanningSettings.mockResolvedValue({});
    const user = userEvent.setup();
    withRouter(<TentativeDemandTab phase3On canViewFinance={false} />);
    const box = await screen.findByTestId("mfg-settings-phase3");
    expect(within(box).getByText("Hidden (finance access needed)")).toBeTruthy();
    expect(within(box).queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mp.putPlanningSettings).toHaveBeenCalled());
    const body = mp.putPlanningSettings.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("export_document_days");
    expect(body).not.toHaveProperty("cpm_override");
  });

  it("offers only the Cost & cash timing on the Cost & cash tab when integrated planning is off", async () => {
    mp.putPlanningSettings.mockResolvedValue({});
    const user = userEvent.setup();
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} integratedOn={false} canEditSettings canViewFinance />);
    const box = await screen.findByTestId("mfg-settings-phase3");
    expect(screen.queryByLabelText("Default expiry (days)")).toBeNull();
    const doc = within(box).getByLabelText("Export document days");
    await user.clear(doc);
    await user.type(doc, "10");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mp.putPlanningSettings).toHaveBeenCalled());
    const body = mp.putPlanningSettings.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).toMatchObject({ export_document_days: 10, export_usance_days: 90, btb_usance_days: 120 });
    expect(body).not.toHaveProperty("stage_probability");
    expect(body).not.toHaveProperty("tentative_default_expiry_days");
  });

  it("does not repeat the settings on the Cost & cash tab when integrated planning is on", async () => {
    withRouter(<CostCashTab flags={{ cost: false, cash: true }} integratedOn canEditSettings canViewFinance />);
    await screen.findByTestId("mfg-financing-gap");
    expect(screen.queryByTestId("mfg-planning-settings")).toBeNull();
  });

  it("explains a 403 on the money settings", async () => {
    mp.getPlanningSettings.mockResolvedValue({ ...base, export_document_days: 7, export_usance_days: 90, btb_usance_days: 120, cpm_override: "3.0000" });
    mp.putPlanningSettings.mockRejectedValue(new ApiError("Forbidden", 403));
    const user = userEvent.setup();
    withRouter(<TentativeDemandTab phase3On canViewFinance />);
    expect(((await screen.findByLabelText("Cost per minute override")) as HTMLInputElement).value).toBe("3.0000");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/not allowed to change the money settings/)).toBeTruthy();
  });
});
