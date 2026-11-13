// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/core";
import type { ForwardBucketRow, ForwardPlanResponse, SchedulerJob, SchedulerPreviewResponse } from "@/api/mfgAdvancedPlanning";

const map = vi.hoisted(() => ({
  getForwardPlan: vi.fn(),
  compareScenarios: vi.fn(),
  getForecastDemand: vi.fn(),
  getFinanceConstrained: vi.fn(),
  getSchedulerPreview: vi.fn(),
  convertProposal: vi.fn(),
}));

const mp = vi.hoisted(() => ({ getPlanningPermissions: vi.fn(), getPlanningSettings: vi.fn(), putPlanningSettings: vi.fn() }));

const mi = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getCapacity: vi.fn(),
  getLineLoading: vi.fn(),
  getReadiness: vi.fn(),
  getDeliveryPrediction: vi.fn(),
}));

vi.mock("@/api/mfgAdvancedPlanning", () => ({ mfgAdvancedPlanningApi: map }));
vi.mock("@/api/mfgPlanning", () => ({ mfgPlanningApi: mp }));
vi.mock("@/api/manufacturingIntelligence", () => ({ manufacturingIntelligenceApi: mi }));

import { ManufacturingIntelligenceSection } from "../ManufacturingIntelligenceSection";
import { NO_PHASE2 } from "../phase2/phase2Logic";
import { CapacityDemandBody } from "./CapacityDemandView";
import { ForwardPlanTab } from "./ForwardPlanTab";
import { SchedulerView } from "./SchedulerView";

const LAYERS_ZERO: Record<string, string> = {
  CONFIRMED_PLANNED_FIRM: "0.00",
  CONFIRMED_PLANNED_SOFT: "0.00",
  UNCONFIRMED_ORDER_ROWS: "0.00",
  UNLINKED_ROWS: "0.00",
  OVERDUE_PLANNED_BACKLOG: "0.00",
  CONFIRMED_UNPLANNED: "0.00",
  OVERDUE_UNPLANNED: "0.00",
  TENTATIVE_FULL: "0.00",
  TENTATIVE_WEIGHTED: "0.00",
  FORECAST_RESIDUAL: "0.00",
};

const bucket = (over: Partial<ForwardBucketRow> = {}): ForwardBucketRow => ({
  index: 0,
  start: "2026-11-13",
  end: "2026-11-19",
  working_days: 6,
  capacity_minutes: "10000.00",
  capacity_status: "COMPLETE",
  unknown_line_days: 0,
  unknown_reasons: {},
  overtime_minutes: "0.00",
  partial_month: false,
  layers: { ...LAYERS_ZERO, CONFIRMED_PLANNED_FIRM: "5000.00", TENTATIVE_WEIGHTED: "1000.00", TENTATIVE_FULL: "4000.00" },
  load_minutes: "6000.00",
  gap_minutes: "4000.00",
  utilization_pct: "60.00",
  reason_codes: [],
  ...over,
});

const forwardPlan = (over: Partial<ForwardPlanResponse> = {}): ForwardPlanResponse => ({
  engine_version: "1",
  as_of: "2026-11-13",
  date_from: "2026-11-13",
  date_to: "2027-02-10",
  horizon_days: 90,
  bucket: "week",
  factory_unit: null,
  scenario: "BASE",
  parameters: {},
  layers_included: ["CONFIRMED_PLANNED_FIRM", "CONFIRMED_PLANNED_SOFT", "CONFIRMED_UNPLANNED", "TENTATIVE_WEIGHTED"],
  efficiency: { basis: "P50", mode: "EMPIRICAL_SPREAD", lines_by_mode: {}, predictive: true },
  frozen_end: "2026-11-26",
  lines: 4,
  virtual_lines: 0,
  buckets: [bucket(), bucket({ index: 1, start: "2026-11-20", end: "2026-11-26", capacity_status: "PARTIAL", unknown_line_days: 2, utilization_pct: null })],
  totals: { capacity_minutes: "20000.00", load_minutes: "12000.00", gap_minutes: "8000.00", overtime_minutes: "0.00", layers: {} },
  constrained: null,
  identity: {},
  counts: {},
  beyond_horizon_minutes: {},
  forecast: { availability: "UNAVAILABLE", families_available: [], families_insufficient: [] },
  median_line_daily_minutes: "2400.00",
  reason_codes: [],
  notices: ["UNCONFIRMED_ORDERS_WITHOUT_ROWS: 2 unconfirmed orders have no bookings and are not demand"],
  assumptions: ["Minutes are SMV minutes."],
  ...over,
});

const job = (over: Partial<SchedulerJob> = {}): SchedulerJob => ({
  job_id: "row:11",
  kind: "ROW",
  order_id: 5,
  order_code: "ORD-5",
  config_id: 11,
  style_id: 3,
  family: "T-shirt",
  qty: "1000.000",
  smv_per_piece: "10.0000",
  minutes: "10000.00",
  need_by: "2026-12-20",
  earliest_start: "2026-11-27",
  priority_rank: 1,
  status: "PLACED",
  action: "UPDATE",
  current: { line_id: 1, start_date: "2026-12-10", end_date: "2026-12-25" },
  placement: {
    line_id: 2,
    line_code: "L2",
    start_date: "2026-11-30",
    end_date: "2026-12-12",
    working_days: 11,
    lateness_days: 0,
    changeover_rank: 0,
    score: { lateness_days: 0, changeover_rank: 0, idle_gap_days: 0, overtime_minutes: "0.00", line_code: "L2" },
  },
  alternatives: [
    {
      line_id: 1,
      line_code: "L1",
      start_date: "2026-12-10",
      end_date: "2026-12-25",
      score: { lateness_days: 5, changeover_rank: 0, idle_gap_days: 0, overtime_minutes: "0.00", line_code: "L1" },
      deciding_criterion: "LATENESS",
    },
  ],
  tentative_displaced: [],
  overtime_would_recover_minutes: null,
  reason_codes: [],
  ...over,
});

const HASH = "a".repeat(64);
const preview = (over: Partial<SchedulerPreviewResponse> = {}): SchedulerPreviewResponse => ({
  engine_version: "1",
  as_of: "2026-11-13",
  date_from: "2026-11-13",
  date_to: "2027-02-10",
  horizon_days: 90,
  frozen_end: "2026-11-26",
  factory_unit: null,
  parameters: {},
  settings: { frozen_horizon_days: 14, changeover_loss_pct: 50 },
  lines: [
    { line_id: 1, line_code: "L1" },
    { line_id: 2, line_code: "L2" },
  ],
  jobs: [job(), job({ job_id: "order:7", kind: "ORDER", order_id: 7, order_code: "ORD-7", config_id: null, current: null, status: "UNSCHEDULED", action: null, placement: null, alternatives: [], overtime_would_recover_minutes: "1200.00", reason_codes: ["NO_CAPACITY_IN_HORIZON", "OVERTIME_WOULD_RECOVER"] })],
  items: [
    {
      job_id: "row:11",
      action: "UPDATE",
      config_id: 11,
      line_id: 2,
      order_id: 5,
      style_id: 3,
      start_date: "2026-11-30",
      planned_end_date: "2026-12-12",
      planned_qty: null,
      reservation_status: null,
      target_efficiency_pct: null,
    },
  ],
  kpis: {
    before: { late_jobs: 2, lateness_days: 9, changeovers: 3, overtime_minutes: "0.00", unscheduled_jobs: 0 },
    after: { late_jobs: 1, lateness_days: 4, changeovers: 2, overtime_minutes: "0.00", unscheduled_jobs: 1 },
  },
  firm_reschedule_suggested: [
    { config_id: 99, order_id: 9, order_code: "ORD-9", line_id: 1, end_date: "2026-12-30", need_by: "2026-12-25", lateness_days: 5, reason_codes: ["FIRM_RESCHEDULE_SUGGESTED"] },
  ],
  counts: { jobs_total: 2, candidate_lines: 2 },
  proposal_hash: HASH,
  proposal_only: true,
  reason_codes: ["PROPOSAL_ONLY", "FIRM_RESCHEDULE_SUGGESTED"],
  notices: [],
  assumptions: [],
  ...over,
});

const PERMS = {
  can_propose: true,
  can_manage_tentative: true,
  can_manage_assignments: true,
  can_approve: true,
  can_manage_settings: true,
  can_edit_style_smv: true,
  can_allocate: true,
  is_admin_or_manager: true,
  can_view_finance: false,
};

beforeEach(() => {
  for (const f of [...Object.values(map), ...Object.values(mp), ...Object.values(mi)]) f.mockReset();
  mp.getPlanningPermissions.mockResolvedValue(PERMS);
  mp.getPlanningSettings.mockResolvedValue({
    stage_probability: { INQUIRY: null, QUOTATION: null },
    tentative_default_expiry_days: 30,
    receipt_buffer_days: 3,
    frozen_horizon_days: 14,
    changeover_loss_pct: 50,
  });
  map.getForwardPlan.mockResolvedValue(forwardPlan());
  map.getForecastDemand.mockResolvedValue({
    as_of: "2026-11-13",
    date_from: "2026-11-13",
    date_to: "2027-02-10",
    horizon_days: 90,
    method: "SEASONAL",
    label: "FORECAST_AT_EXFACTORY_MONTH",
    availability: "UNAVAILABLE",
    tenant_history_months: 3,
    tenant_history_sufficient: false,
    coverage_pct: null,
    months: [],
    families: [],
    reason_codes: [],
    notices: [],
    assumptions: [],
  });
  map.getSchedulerPreview.mockResolvedValue(preview());
  for (const f of Object.values(mi)) f.mockReturnValue(new Promise(() => {}));
  localStorage.clear();
});

afterEach(() => cleanup());

const ALL_ON = { advanced: true, scheduler: true, finance: true };

describe("Forward plan tab gating", () => {
  it("is hidden while the flag is off and shown when it is on", async () => {
    const { unmount } = render(<ManufacturingIntelligenceSection enabled phase2={NO_PHASE2} />);
    expect(screen.queryByRole("tab", { name: "Forward plan" })).toBeNull();
    unmount();
    render(<ManufacturingIntelligenceSection enabled phase2={NO_PHASE2} phase5={{ advanced: true, scheduler: false, finance: false }} initialTab="forward" />);
    expect(await screen.findByRole("tab", { name: "Forward plan", selected: true })).toBeTruthy();
    expect(await screen.findByTestId("mfg-forward-capacity")).toBeTruthy();
    expect(screen.queryByTestId("mfg-forward-view-scheduler")).toBeNull();
  });

  it("hides the Finance view without can_view_finance and shows it with it", async () => {
    const { unmount } = render(
      <ForwardPlanTab flags={ALL_ON} canViewFinance={false} canPropose canEditSettings storageKey={null} />,
    );
    expect(screen.getByTestId("mfg-forward-view-scheduler")).toBeTruthy();
    expect(screen.queryByTestId("mfg-forward-view-finance")).toBeNull();
    expect(map.getFinanceConstrained).not.toHaveBeenCalled();
    unmount();
    render(<ForwardPlanTab flags={ALL_ON} canViewFinance canPropose canEditSettings storageKey={null} />);
    expect(screen.getByTestId("mfg-forward-view-finance")).toBeTruthy();
    await waitFor(() => expect(map.getForwardPlan).toHaveBeenCalled());
  });
});

describe("Scheduler settings", () => {
  it("edits the frozen zone and changeover loss with range checks", async () => {
    const user = userEvent.setup();
    mp.putPlanningSettings.mockResolvedValue({});
    render(<ForwardPlanTab flags={ALL_ON} canViewFinance={false} canPropose canEditSettings storageKey={null} />);
    const frozen = await screen.findByLabelText(/Frozen zone \(days\)/);
    expect((frozen as HTMLInputElement).value).toBe("14");
    expect(screen.queryByLabelText(/Inquiry confidence/)).toBeNull();
    await user.clear(frozen);
    await user.type(frozen, "70");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Frozen zone days must be 14-60/)).toBeTruthy();
    expect(mp.putPlanningSettings).not.toHaveBeenCalled();
    await user.clear(frozen);
    await user.type(frozen, "21");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mp.putPlanningSettings).toHaveBeenCalledWith({ frozen_horizon_days: 21, changeover_loss_pct: 50 }));
  });
});

describe("Capacity vs demand", () => {
  it("shows tentative full and weighted as alternatives, never summed", async () => {
    const user = userEvent.setup();
    render(<CapacityDemandBody data={forwardPlan()} />);
    // scenario view: firm 5000 + weighted 1000
    expect(screen.getByTestId("mfg-forward-load-0").textContent).toBe("6,000");
    const legend = screen.getByTestId("mfg-forward-legend");
    expect(within(legend).getByText("Tentative (weighted by confidence)")).toBeTruthy();
    expect(within(legend).queryByText("Tentative (full quantity)")).toBeNull();

    await user.click(screen.getByLabelText("Full quantity"));
    // firm 5000 + full 4000 (not 5000 + 1000 + 4000)
    expect(screen.getByTestId("mfg-forward-load-0").textContent).toBe("9,000");
    expect(within(legend).getByText("Tentative (full quantity)")).toBeTruthy();
    expect(within(legend).queryByText("Tentative (weighted by confidence)")).toBeNull();
  });

  it("marks partial capacity and shows notices in plain words", () => {
    render(<CapacityDemandBody data={forwardPlan()} />);
    expect(within(screen.getByTestId("mfg-forward-bucket-1")).getByText("Partial")).toBeTruthy();
    expect(within(screen.getByTestId("mfg-forward-notices")).getByText(/2 unconfirmed orders have no bookings/)).toBeTruthy();
  });

  it("shows a finite result as returned (no tentative switch)", () => {
    render(<CapacityDemandBody data={forwardPlan({ scenario: "CAPACITY_CONSTRAINED", constrained: { deferred_beyond_horizon_minutes: {} } })} />);
    expect(screen.queryByTestId("mfg-tentative-view")).toBeNull();
  });
});

describe("Scenarios", () => {
  it("validates parameters before calling the server and saves them per user", async () => {
    const user = userEvent.setup();
    render(<ForwardPlanTab flags={ALL_ON} canViewFinance={false} canPropose canEditSettings storageKey="p7_mfg_scenario:1:2" />);
    await user.click(screen.getByTestId("mfg-forward-view-scenarios"));
    await user.clear(screen.getByLabelText("Absence %"));
    await user.type(screen.getByLabelText("Absence %"), "5");
    map.getForwardPlan.mockClear();
    await user.click(screen.getByRole("button", { name: "Use in Capacity vs demand" }));
    expect(await screen.findByText(/can be used only with Planned efficiency/)).toBeTruthy();
    expect(map.getForwardPlan).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Efficiency"), "PLAN");
    await user.click(screen.getByRole("button", { name: "Save my parameters" }));
    expect(await screen.findByText(/saved in this browser/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("p7_mfg_scenario:1:2") ?? "{}")).toMatchObject({ absence_pct: "5", efficiency_basis: "PLAN" });

    await user.click(screen.getByRole("button", { name: "Use in Capacity vs demand" }));
    await waitFor(() => expect(map.getForwardPlan).toHaveBeenCalledWith(expect.objectContaining({ absence_pct: "5", efficiency_basis: "PLAN", scenario: "BASE" })));
  });
});

describe("Scheduler", () => {
  const openActions = async (user: ReturnType<typeof userEvent.setup>, jobId: string) => {
    await user.click(within(screen.getByTestId(`mfg-job-${jobId}`)).getByRole("button", { name: "Actions" }));
  };

  it("shows the proposal banner, KPIs and the information notes", async () => {
    const user = userEvent.setup();
    render(<SchedulerView horizonDays={90} canPropose />);
    expect(map.getSchedulerPreview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    expect((await screen.findByTestId("mfg-proposal-banner")).textContent).toMatch(/Proposal only - needs approval/);
    expect(screen.getByTestId("mfg-scheduler-kpis")).toBeTruthy();
    expect(within(screen.getByTestId("mfg-firm-reschedule")).getByText(/ORD-9/)).toBeTruthy();
    expect(within(screen.getByTestId("mfg-job-order:7")).getByText(/Overtime could recover the delay/)).toBeTruthy();
    expect(map.getSchedulerPreview).toHaveBeenCalledWith({
      horizon_days: 90,
      factory_unit: null,
      material_delay_days: 0,
      btb_delay_days: 0,
      exclude_job_ids: [],
    });
  });

  it("re-runs the preview when a job is excluded or included", async () => {
    const user = userEvent.setup();
    render(<SchedulerView horizonDays={120} factoryUnit="U1" canPropose />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await screen.findByTestId("mfg-job-row:11");
    await openActions(user, "row:11");
    await user.click(await screen.findByRole("menuitem", { name: "Exclude" }));
    await waitFor(() =>
      expect(map.getSchedulerPreview).toHaveBeenLastCalledWith(expect.objectContaining({ horizon_days: 120, factory_unit: "U1", exclude_job_ids: ["row:11"] })),
    );
    await screen.findByTestId("mfg-scheduler-excluded");
    await openActions(user, "row:11");
    await user.click(await screen.findByRole("menuitem", { name: "Include" }));
    await waitFor(() => expect(map.getSchedulerPreview).toHaveBeenLastCalledWith(expect.objectContaining({ exclude_job_ids: [] })));
  });

  it("explains why a line was chosen", async () => {
    const user = userEvent.setup();
    render(<SchedulerView horizonDays={90} canPropose />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await screen.findByTestId("mfg-job-row:11");
    await openActions(user, "row:11");
    await user.click(await screen.findByRole("menuitem", { name: "Why this line" }));
    const panel = await screen.findByTestId("mfg-why-panel");
    expect(within(panel).getByText(/Proposed on L2/)).toBeTruthy();
    expect(within(panel).getByText(/L1, .*not chosen because it finishes later/)).toBeTruthy();
  });

  it("needs a note, sends the whole proposal once per dialog and links to Plan changes", async () => {
    const user = userEvent.setup();
    const onOpenTab = vi.fn();
    map.convertProposal
      .mockRejectedValueOnce(new ApiError("Server error", 500))
      .mockResolvedValueOnce({ id: 31, revision_no: 4, status: "PROPOSED", title: "Scheduler proposal aaaa", reason: "Recover late orders", request_id: "x", scheduler: { proposal_hash: HASH, replay: false, items: 1 } });
    render(<SchedulerView horizonDays={90} canPropose onOpenTab={onOpenTab} />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await user.click(await screen.findByRole("button", { name: "Create plan revision" }));
    const dialog = await screen.findByTestId("mfg-convert-dialog");
    const submit = within(dialog).getByRole("button", { name: "Create plan revision" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Note for the approver/), "abc");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Note for the approver/), "de Recover late orders");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    await user.click(submit);
    expect(await within(dialog).findByTestId("mfg-convert-error")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Create plan revision" }));
    await screen.findByTestId("mfg-convert-done");

    expect(map.convertProposal).toHaveBeenCalledTimes(2);
    const first = map.convertProposal.mock.calls[0]![0];
    const second = map.convertProposal.mock.calls[1]![0];
    expect(first.request_id).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    expect(second.request_id).toBe(first.request_id);
    expect(first).toEqual({
      params: { horizon_days: 90, factory_unit: null, material_delay_days: 0, btb_delay_days: 0, exclude_job_ids: [] },
      proposal_hash: HASH,
      note: "abcde Recover late orders",
      request_id: first.request_id,
    });
    expect(screen.getByTestId("mfg-convert-done").textContent).toMatch(/Plan revision 4 created/);
    await user.click(screen.getByRole("button", { name: "Open Plan changes" }));
    expect(onOpenTab).toHaveBeenCalledWith("plan");
  });

  it("re-runs the preview on 409 PROPOSAL_STALE and says so", async () => {
    const user = userEvent.setup();
    map.convertProposal.mockRejectedValueOnce(new ApiError("The plan changed since the preview", 409, null, "PROPOSAL_STALE"));
    render(<SchedulerView horizonDays={90} canPropose />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await user.click(await screen.findByRole("button", { name: "Create plan revision" }));
    const dialog = await screen.findByTestId("mfg-convert-dialog");
    await user.type(within(dialog).getByLabelText(/Note for the approver/), "Recover late orders");
    const calls = map.getSchedulerPreview.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Create plan revision" }));
    expect(await screen.findByText(/The line plan changed since this preview/)).toBeTruthy();
    expect(screen.queryByTestId("mfg-convert-dialog")).toBeNull();
    await waitFor(() => expect(map.getSchedulerPreview.mock.calls.length).toBe(calls + 1));
  });

  it("shows a replayed convert as already sent", async () => {
    const user = userEvent.setup();
    map.convertProposal.mockResolvedValueOnce({ id: 31, revision_no: 4, status: "PROPOSED", title: null, reason: "x", request_id: "x", scheduler: { proposal_hash: HASH, replay: true, items: null } });
    render(<SchedulerView horizonDays={90} canPropose />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await user.click(await screen.findByRole("button", { name: "Create plan revision" }));
    const dialog = await screen.findByTestId("mfg-convert-dialog");
    await user.type(within(dialog).getByLabelText(/Note for the approver/), "Recover late orders");
    await user.click(within(dialog).getByRole("button", { name: "Create plan revision" }));
    expect((await screen.findByTestId("mfg-convert-done")).textContent).toMatch(/already sent/);
  });

  it("hides Create plan revision without the write permission", async () => {
    const user = userEvent.setup();
    render(<SchedulerView horizonDays={90} canPropose={false} />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    await screen.findByTestId("mfg-proposal-banner");
    expect(screen.queryByRole("button", { name: "Create plan revision" })).toBeNull();
  });

  it("asks for a factory unit when there are too many lines", async () => {
    const user = userEvent.setup();
    map.getSchedulerPreview.mockRejectedValueOnce(new ApiError("61 active lines", 422, null, "TOO_MANY_LINES"));
    render(<SchedulerView horizonDays={90} canPropose />);
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    expect((await screen.findByTestId("mfg-scheduler-error")).textContent).toMatch(/Type a factory unit/);
    expect(screen.getByRole("button", { name: "Run preview again" })).toBeTruthy();
  });
});
