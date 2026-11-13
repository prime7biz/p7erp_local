// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/core";
import type { DeliveryForecastResponse, Recommendation, RecommendationsResponse, SupplierLatenessResponse } from "@/api/mfgPredictive";

const mpr = vi.hoisted(() => ({
  getDeliveryForecast: vi.fn(),
  getLineEfficiency: vi.fn(),
  getSupplierLateness: vi.fn(),
  getAnomalies: vi.fn(),
  getCalibration: vi.fn(),
  listRecommendations: vi.fn(),
  decideRecommendation: vi.fn(),
  explainPrediction: vi.fn(),
}));

const decision = (over: Record<string, unknown> = {}) => ({
  finding_id: 12,
  decision_id: 501,
  decision: "ACCEPTED",
  note: null,
  decided_by: 3,
  decided_at: "2026-11-13T06:00:00Z",
  replayed: false,
  finding_status: "OPEN",
  decision_status: "ACCEPTED",
  deadline_date: "2026-11-20",
  next_step: { href: "/app/production/line-plan?order=5", label: "Line plan" },
  recommendation: {},
  ...over,
});

const explained = (source: string, text: string) => ({
  subject: "finding",
  record_id: 12,
  as_of: "2026-11-13",
  source,
  tag: source === "ai" ? "AI_TEXT" : "RULES",
  text,
  findings: [],
  rules_text: "Rule: material is late.",
  facts: [],
  dates: {},
  fallback_reason: source === "ai" ? null : "provider_error",
  generated_at: "2026-11-13T06:00:00Z",
});

const mp = vi.hoisted(() => ({ getPlanningPermissions: vi.fn() }));

const mi = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getCapacity: vi.fn(),
  getLineLoading: vi.fn(),
  getReadiness: vi.fn(),
  getDeliveryPrediction: vi.fn(),
}));

vi.mock("@/api/mfgPredictive", () => ({ mfgPredictiveApi: mpr }));
vi.mock("@/api/mfgPlanning", () => ({ mfgPlanningApi: mp }));
vi.mock("@/api/manufacturingIntelligence", () => ({ manufacturingIntelligenceApi: mi }));

import { ControlTowerShortLinkRedirect } from "../../ControlTowerShortLinkRedirect";
import { ManufacturingIntelligenceSection } from "../ManufacturingIntelligenceSection";
import { AnomaliesCard } from "./AnomaliesCard";
import { DeliveryForecastCard } from "./DeliveryForecastCard";
import { RecommendationsCard } from "./RecommendationsCard";
import { SupplierLatenessCard } from "./SupplierLatenessCard";

const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  id: 12,
  finding_key: "DELIVERY_RISK:order:5",
  kind: "DELIVERY_RISK",
  severity: "critical",
  priority: "24.0000",
  department: "Production Planning",
  order_id: 5,
  order_code: "ORD-5",
  line_id: 3,
  line_code: "L3",
  status: "OPEN",
  alert_eligible: true,
  first_detected_on: "2026-11-10",
  last_detected_on: "2026-11-13",
  cleared_on: null,
  deadline_date: "2026-11-20",
  decision_status: null,
  outcome_status: null,
  payload: {
    kind: "DELIVERY_RISK",
    kind_label: "Delivery risk",
    subject: { order_code: "ORD-5" },
    facts: [
      { id: "delay_days", label: "likely delay", value: "8", unit: "days" },
      { id: "on_time_probability", label: "chance of shipping on time", value: "25.00", unit: "percent" },
    ],
    dates: { target_date: "2026-11-20", p50_date: "2026-11-28" },
    affected_dates: ["2026-11-20"],
    days_affected: 8,
    orders_affected: 1,
    reason_codes: ["LATE"],
    confidence: "MEDIUM",
    recommendation: { action: "Add a second line from 18/11", screen: { href: "/app/production/line-plan?order=5", label: "Line plan" } },
    alternatives: ["Overtime on Friday"],
    approval_requirement: "Plan changes follow the existing plan approval; this finding changes nothing by itself.",
    assumptions: ["Deterministic rule result"],
    band: "LATE",
  },
  ...over,
});

const list = (items: Recommendation[], extra: Partial<RecommendationsResponse> = {}): RecommendationsResponse => ({
  status: "OPEN",
  kind: null,
  limit: 100,
  items,
  truncated: false,
  kinds: ["DELIVERY_RISK", "LATE_MATERIAL", "CAPACITY_OVERLOAD", "LINE_IDLE", "OUTPUT_DROP", "QUALITY_SPIKE"],
  notices: [],
  ...extra,
});

const forecast = (over: Partial<DeliveryForecastResponse> = {}): DeliveryForecastResponse => ({
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  model_version: "p4-v1",
  as_of: "2026-11-13",
  target_date: "2026-11-30",
  target_basis: "EX_FACTORY",
  order_qty: "1000.000",
  produced_qty: "200.000",
  remaining_qty: "800.000",
  band: "AT_RISK",
  on_time_probability: "0.6500",
  probability_display: "65 %",
  calibrated: false,
  calibration_label: "uncalibrated",
  spread_mode: "EMPIRICAL_SPREAD",
  spread_window_days: 5,
  p50_date: "2026-11-28",
  p80_date: "2026-12-02",
  p90_date: "2026-12-05",
  start_date: "2026-11-14",
  working_days_needed: 12,
  daily_rate_likely: "66.6667",
  daily_rate_p80: "60.0000",
  daily_rate_p90: "55.0000",
  delay_days: null,
  early_days: 2,
  efficiency_source: "BLENDED",
  lateness_source: "VENDOR",
  confidence: "MEDIUM",
  material: {
    status: "DATED",
    reason_codes: ["MATERIAL_EXPECTED_DATE_USED"],
    ready_p50: "2026-11-14",
    ready_p80: "2026-11-16",
    ready_p90: "2026-11-18",
    lateness_source: "VENDOR",
    shared_supply: false,
    po_lines: [],
  },
  lines: [],
  grid: [],
  drivers: [{ driver: "MATERIAL", impact_days: 2, detail: "Fabric PO expected 14/11" }],
  reason_codes: [],
  missing_inputs: [],
  assumptions: ["Plan-basis efficiency"],
  inputs_hash: null,
  ...over,
});

const lateness: SupplierLatenessResponse = {
  as_of: "2026-11-13",
  window_days: 365,
  promise_basis: "CURRENT_EXPECTED_DATE",
  min_sample: 5,
  tenant: { n: 40, p50_days: 2, p80_days: 6, p90_days: 9, on_time_rate: "0.4500", open_late_lower_bound: 3, sufficient: true },
  vendors: [
    { vendor_id: 7, vendor_name: "Fabric Mills", n: 12, p50_days: 3, p80_days: 7, p90_days: 10, on_time_rate: "0.3333", open_late_lower_bound: 1, sufficient: true },
  ],
  categories: [],
  vendor_categories: [],
  excluded: {},
  truncated: false,
  notices: [],
  assumptions: [],
};

const withRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mi.getSummary.mockReturnValue(new Promise(() => {}));
  mi.getCapacity.mockReturnValue(new Promise(() => {}));
  mi.getLineLoading.mockReturnValue(new Promise(() => {}));
  mpr.listRecommendations.mockResolvedValue(list([rec()]));
  mpr.getLineEfficiency.mockReturnValue(new Promise(() => {}));
  mpr.getSupplierLateness.mockReturnValue(new Promise(() => {}));
  mpr.getAnomalies.mockReturnValue(new Promise(() => {}));
  mpr.getCalibration.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
});

async function openRowMenu(rowTestId: string) {
  const user = userEvent.setup();
  const row = await screen.findByTestId(rowTestId);
  await user.click(within(row).getByRole("button", { name: "Actions" }));
  return user;
}

describe("Predictions tab gating", () => {
  it("has no Predictions tab and loads nothing while the flag is off", () => {
    withRouter(<ManufacturingIntelligenceSection enabled />);
    expect(screen.queryByRole("tab", { name: "Predictions" })).toBeNull();
    expect(mpr.listRecommendations).not.toHaveBeenCalled();
  });

  it("ignores a deep link to the tab while the flag is off", () => {
    withRouter(<ManufacturingIntelligenceSection enabled initialTab="predictions" focusFindingId={12} />);
    expect(screen.queryByTestId("mfg-predictions-tab")).toBeNull();
    expect(mpr.listRecommendations).not.toHaveBeenCalled();
  });

  it("shows the tab with the flag and the statistics notice", async () => {
    const user = userEvent.setup();
    withRouter(<ManufacturingIntelligenceSection enabled phase4={{ predictions: true, aiText: false }} />);
    expect(mp.getPlanningPermissions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Predictions" }));
    const tab = await screen.findByTestId("mfg-predictions-tab");
    expect(within(tab).getByText("Statistical estimate from your own history - never changes plans.")).toBeTruthy();
    await screen.findByTestId("mfg-rec-12");
    expect(mpr.listRecommendations).toHaveBeenCalledWith({ status: "OPEN", kind: undefined, limit: 100 });
  });
});

describe("deep link to a finding", () => {
  it("opens the Predictions tab and the finding's details", async () => {
    withRouter(<ManufacturingIntelligenceSection enabled phase4={{ predictions: true, aiText: false }} initialTab="predictions" focusFindingId={12} />);
    const dialog = await screen.findByRole("dialog", { name: "Delivery risk · ORD-5 · L3" });
    expect(within(dialog).getByText("Add a second line from 18/11")).toBeTruthy();
    expect(within(dialog).getByText("Production Planning")).toBeTruthy();
    expect(within(dialog).getByText("Overtime on Friday")).toBeTruthy();
    expect(within(dialog).getByText("8 days")).toBeTruthy();
    expect(within(dialog).getByText("25%")).toBeTruthy();
    expect(within(dialog).getByText("28/11/2026")).toBeTruthy();
    expect(within(dialog).getByText(/Plan changes follow the existing plan approval/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Open Line plan" })).toBeTruthy();
  });

  it("looks in all findings when the linked one is no longer open", async () => {
    mpr.listRecommendations.mockImplementation(async (p: { status: string }) =>
      p.status === "ALL" ? list([rec({ id: 40, status: "CLEARED", cleared_on: "2026-11-12" })], { status: "ALL" }) : list([]),
    );
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} focusFindingId={40} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mpr.listRecommendations).toHaveBeenLastCalledWith({ status: "ALL", kind: undefined, limit: 100 });
    expect(screen.getByText("Cleared findings cannot be decided any more.")).toBeTruthy();
  });

  it("says so when the linked finding cannot be found", async () => {
    mpr.listRecommendations.mockImplementation(async (p: { status: string }) => list([], { status: p.status }));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} focusFindingId={99} />);
    expect(await screen.findByText(/The linked finding was not found/)).toBeTruthy();
  });

  it("the short link /app/control-tower keeps tab and finding", async () => {
    function Where() {
      const loc = useLocation();
      return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/app/control-tower?tab=predictions&finding=12"]}>
        <Routes>
          <Route path="/app/control-tower" element={<ControlTowerShortLinkRedirect />} />
          <Route path="/app/operations/control-tower" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId("where")).textContent).toBe("/app/operations/control-tower?tab=predictions&finding=12");
  });
});

describe("delivery forecast", () => {
  it("shows likely / P80 / P90 dates, the probability and the uncalibrated label", async () => {
    mpr.getDeliveryForecast.mockResolvedValue(forecast());
    withRouter(<DeliveryForecastCard orderOptions={[]} orderId={5} onOrderChange={() => {}} />);
    const dates = await screen.findByTestId("mfg-forecast-dates");
    expect(within(dates).getByText("28/11/2026")).toBeTruthy();
    expect(within(dates).getByText("02/12/2026")).toBeTruthy();
    expect(within(dates).getByText("05/12/2026")).toBeTruthy();
    expect(within(dates).getByText("65 %")).toBeTruthy();
    expect(screen.getByText("Uncalibrated")).toBeTruthy();
    expect(screen.getByText("At risk")).toBeTruthy();
    expect(screen.getByText(/Fabric PO expected 14\/11/)).toBeTruthy();
  });

  it("says 'not enough history' with fixed bands (no probability, no P80)", async () => {
    mpr.getDeliveryForecast.mockResolvedValue(
      forecast({ spread_mode: "FIXED_BANDS", on_time_probability: null, probability_display: null, p80_date: null, reason_codes: ["INSUFFICIENT_HISTORY"] }),
    );
    withRouter(<DeliveryForecastCard orderOptions={[]} orderId={5} onOrderChange={() => {}} />);
    const dates = await screen.findByTestId("mfg-forecast-dates");
    expect(within(dates).getByText("Not enough history for a probability yet")).toBeTruthy();
    expect(screen.getAllByText(/Not enough history for a probability yet/).length).toBeGreaterThan(1);
    expect(within(dates).queryByText("02/12/2026")).toBeNull();
  });

  it("explains hidden purchase order detail", async () => {
    mpr.getDeliveryForecast.mockResolvedValue(forecast({ reason_codes: ["PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS"] }));
    withRouter(<DeliveryForecastCard orderOptions={[]} orderId={5} onOrderChange={() => {}} />);
    expect(await screen.findByText(/Purchase order details are hidden/)).toBeTruthy();
  });

  it("asks for an order first", () => {
    withRouter(<DeliveryForecastCard orderOptions={[]} orderId={null} onOrderChange={() => {}} />);
    expect(screen.getByText("Pick an order to see its delivery forecast.")).toBeTruthy();
    expect(mpr.getDeliveryForecast).not.toHaveBeenCalled();
  });
});

describe("accept / reject recommendations", () => {
  it("accept asks to confirm, says it only records the decision, and records it", async () => {
    mpr.decideRecommendation.mockResolvedValue(decision());
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Accept…" }));
    const dialog = screen.getByRole("dialog", { name: "Accept this recommendation?" });
    expect(within(dialog).getByText(/records your decision/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mpr.decideRecommendation).toHaveBeenCalledWith(12, { decision: "ACCEPT" }));
    expect(await screen.findByText(/Decision recorded: Accepted. Nothing else was changed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Line plan" })).toBeTruthy();
    expect(mpr.decideRecommendation).toHaveBeenCalledTimes(1);
  });

  it("reject needs a note before it can be sent", async () => {
    mpr.decideRecommendation.mockResolvedValue(decision({ decision: "REJECTED", decision_status: "REJECTED", note: "Line 4 is free", next_step: null }));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Reject…" }));
    const dialog = screen.getByRole("dialog", { name: "Reject this recommendation?" });
    const confirm = within(dialog).getByRole("button", { name: "Reject" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Note/), "Line 4 is free");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(mpr.decideRecommendation).toHaveBeenCalledWith(12, { decision: "REJECT", note: "Line 4 is free" }));
    expect(await screen.findByText(/Decision recorded: Rejected/)).toBeTruthy();
  });

  it("a replayed decision shows the stored one and records nothing new", async () => {
    mpr.decideRecommendation.mockResolvedValue(decision({ replayed: true }));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Accept…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/already had a decision \(Accepted\). Nothing new was recorded/)).toBeTruthy();
  });

  it("a replay of the opposite choice shows the stored decision", async () => {
    mpr.decideRecommendation.mockResolvedValue(decision({ replayed: true }));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Reject…" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Note/), "Not needed now");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(/already had a decision \(Accepted\)/)).toBeTruthy();
    const row = screen.getByTestId("mfg-rec-12");
    expect(within(row).getByText("Accepted")).toBeTruthy();
  });

  it("a finding that is no longer open (409) shows the server message and reloads", async () => {
    mpr.decideRecommendation.mockRejectedValue(new ApiError("This recommendation is no longer open. Refresh the list.", 409));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Accept…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    expect(await within(screen.getByRole("dialog")).findByText("This recommendation is no longer open. Refresh the list.")).toBeTruthy();
    await waitFor(() => expect(mpr.listRecommendations).toHaveBeenCalledTimes(2));
  });

  it("a decided finding offers no Accept / Reject", async () => {
    mpr.listRecommendations.mockResolvedValue(list([rec({ decision_status: "ACCEPTED" })]));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    await openRowMenu("mfg-rec-12");
    expect(await screen.findByRole("menuitem", { name: "View details" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Accept…" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Reject…" })).toBeNull();
  });

  it("shows a plain message when the user may not decide (403)", async () => {
    mpr.decideRecommendation.mockRejectedValue(new ApiError("Requires admin/manager role", 403));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    const user = await openRowMenu("mfg-rec-12");
    await user.click(await screen.findByRole("menuitem", { name: "Accept…" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Accept" }));
    expect(await within(screen.getByRole("dialog")).findByText(/You are not allowed to record this decision/)).toBeTruthy();
  });

  it("explains hidden late-material findings", async () => {
    mpr.listRecommendations.mockResolvedValue(list([rec()], { notices: ["HIDDEN_KINDS_NO_SOURCE_ACCESS: LATE_MATERIAL"] }));
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} />);
    expect(await screen.findByText("Late material findings are hidden because they need inventory read access.")).toBeTruthy();
  });
});

describe("explain button", () => {
  it("is hidden while the AI text flag is off", async () => {
    withRouter(<RecommendationsCard aiText={false} integratedOn={false} focusFindingId={12} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Explain" })).toBeNull();
  });

  it("shows the labelled AI or rule text when on", async () => {
    mpr.explainPrediction.mockResolvedValueOnce(explained("ai", "The order waits for fabric."));
    mpr.explainPrediction.mockResolvedValueOnce(explained("rules", "Rule: material is late."));
    const user = userEvent.setup();
    withRouter(<RecommendationsCard aiText integratedOn={false} focusFindingId={12} />);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Explain" }));
    expect(await within(dialog).findByText("The order waits for fabric.")).toBeTruthy();
    expect(within(dialog).getByText("AI wording")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Explain again" }));
    expect(await within(dialog).findByText("Rule: material is late.")).toBeTruthy();
    expect(within(dialog).getByText("Rule text")).toBeTruthy();
    expect(mpr.explainPrediction).toHaveBeenCalledWith({ subject: "finding", record_id: 12 });
  });

  it("explains an order forecast only with the AI text flag", async () => {
    mpr.getDeliveryForecast.mockResolvedValue(forecast());
    mpr.explainPrediction.mockResolvedValue(explained("rules", "Rule: the line is slow."));
    const { unmount } = withRouter(<DeliveryForecastCard orderOptions={[]} orderId={5} onOrderChange={() => {}} />);
    await screen.findByTestId("mfg-forecast-dates");
    expect(screen.queryByRole("button", { name: "Explain" })).toBeNull();
    unmount();
    const user = userEvent.setup();
    withRouter(<DeliveryForecastCard orderOptions={[]} orderId={5} onOrderChange={() => {}} aiText />);
    await user.click(await screen.findByRole("button", { name: "Explain" }));
    expect(await screen.findByText("Rule: the line is slow.")).toBeTruthy();
    expect(mpr.explainPrediction).toHaveBeenCalledWith({ subject: "order", record_id: 5 });
  });

  it("tolerates a switched-off or missing explain endpoint (404)", async () => {
    mpr.explainPrediction.mockRejectedValue(new ApiError("Not Found", 404));
    const user = userEvent.setup();
    withRouter(<RecommendationsCard aiText integratedOn={false} focusFindingId={12} />);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Explain" }));
    expect(await within(dialog).findByText(/not available on the server yet/)).toBeTruthy();
  });
});

describe("supplier lateness", () => {
  it("shows a friendly message and no table without inventory access (403)", async () => {
    mpr.getSupplierLateness.mockRejectedValue(new ApiError("Supplier lateness needs inventory read access", 403));
    withRouter(<SupplierLatenessCard />);
    expect(await screen.findByTestId("mfg-supplier-lateness-denied")).toBeTruthy();
    expect(screen.getByText(/only to users with inventory read access/)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Supplier lateness" })).toBeNull();
  });

  it("lists supplier percentiles when allowed", async () => {
    mpr.getSupplierLateness.mockResolvedValue(lateness);
    withRouter(<SupplierLatenessCard />);
    const table = await screen.findByRole("table", { name: "Supplier lateness" });
    const row = within(table).getByText("Fabric Mills").closest("tr")!;
    expect(within(row).getByText("10 d")).toBeTruthy();
    expect(within(row).getByText("33%")).toBeTruthy();
  });
});

describe("anomalies window", () => {
  it("refuses more than 31 days and does not load", async () => {
    mpr.getAnomalies.mockResolvedValue({
      date_from: "2026-11-07",
      date_to: "2026-11-13",
      threshold: "3.5",
      baseline_production_days: 30,
      min_baseline_points: 10,
      lines_checked: 2,
      anomalies: [],
      truncated: false,
      series_skipped: {},
      notices: [],
      assumptions: [],
    });
    withRouter(<AnomaliesCard />);
    expect(await screen.findByText("No unusual results in this window.")).toBeTruthy();
    expect(mpr.getAnomalies).toHaveBeenCalledTimes(1);
    const to = (screen.getByLabelText("To") as HTMLInputElement).value;
    const [y, m, d] = to.split("-").map(Number);
    const from = new Date(y!, m! - 1, d! - 40);
    const iso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: iso } });
    expect((await screen.findByTestId("mfg-anom-window-error")).textContent).toBe("The window can be at most 31 days (now 41).");
    expect(mpr.getAnomalies).toHaveBeenCalledTimes(1);
  });
});
