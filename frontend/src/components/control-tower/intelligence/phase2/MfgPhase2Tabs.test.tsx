// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/core";
import type {
  AllocationPreview,
  EmployeeAssignment,
  LineBooking,
  OrderAllocationState,
  PlanRevision,
  RevisionImpact,
  TentativeBooking,
  TentativeDemandResponse,
} from "@/api/mfgPlanning";

const mp = vi.hoisted(() => ({
  getOrderAllocation: vi.fn(),
  allocatePreview: vi.fn(),
  allocateConfirm: vi.fn(),
  allocationRunPreview: vi.fn(),
  allocationRunConfirm: vi.fn(),
  releaseReservation: vi.fn(),
  releasePeg: vi.fn(),
  reassign: vi.fn(),
  getConflicts: vi.fn(),
  getPlanningPermissions: vi.fn(),
  pickEmployees: vi.fn(),
  getItemAvailability: vi.fn(),
  listBookings: vi.fn(),
  previewRevision: vi.fn(),
  proposeRevision: vi.fn(),
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
  approveRevision: vi.fn(),
  rejectRevision: vi.fn(),
  cancelRevision: vi.fn(),
  getTentativeDemand: vi.fn(),
  createTentativeBooking: vi.fn(),
  updateTentativeBooking: vi.fn(),
  cancelTentativeBooking: vi.fn(),
  getPlanningSettings: vi.fn(),
  putPlanningSettings: vi.fn(),
  listAssignments: vi.fn(),
  createEmployeeAssignment: vi.fn(),
  createMachineAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  endAssignment: vi.fn(),
  deactivateAssignment: vi.fn(),
  getRouteStages: vi.fn(),
  getStyleSmv: vi.fn(),
  putStyleSmv: vi.fn(),
}));

const mi = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getCapacity: vi.fn(),
  getLineLoading: vi.fn(),
  getReadiness: vi.fn(),
  getDeliveryPrediction: vi.fn(),
}));

const clientApi = vi.hoisted(() => ({
  listSewingLines: vi.fn(),
  listProductionShifts: vi.fn(),
  listInquiries: vi.fn(),
  listQuotations: vi.fn(),
  listStyles: vi.fn(),
  listDepartmentMachines: vi.fn(),
  listHrEmployees: vi.fn(),
  lookupHrEmployees: vi.fn(),
}));

vi.mock("@/api/mfgPlanning", () => ({ mfgPlanningApi: mp }));
vi.mock("@/api/manufacturingIntelligence", () => ({ manufacturingIntelligenceApi: mi }));
vi.mock("@/api/client", () => ({ api: clientApi, getTenantId: () => "1" }));

import { ManufacturingIntelligenceSection } from "../ManufacturingIntelligenceSection";
import { MaterialsTab } from "./MaterialsTab";
import { PeopleMachinesTab } from "./PeopleMachinesTab";
import { PlanChangesTab } from "./PlanChangesTab";
import { TentativeDemandTab } from "./TentativeDemandTab";

const orders = [
  { order_id: 5, order_code: "ORD-5", customer_name: "Acme", style_id: null },
  { order_id: 6, order_code: "ORD-6", customer_name: "Beta", style_id: null },
];

const allocation: OrderAllocationState = {
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  order_bom_id: 1,
  order_bom_status: "APPROVED",
  order_bom_usable: true,
  default_kind: "HARD_ATP",
  priority_rank: 1,
  priority_date: "2026-11-20",
  lines: [
    {
      bom_item_id: 11,
      item_id: 21,
      item_name: "Fabric A",
      category: null,
      uom: "m",
      required_qty: "100.0000",
      requirement_source: "ORDER_BOM",
      issued_qty: "0.0000",
      held_qty: "10.0000",
      tentative_held_qty: "0.0000",
      pegged_qty: "0.0000",
      tentative_pegged_qty: "0.0000",
      shortfall_qty: "90.0000",
      hold_qty: "0.0000",
      pegs: [],
      remaining_short_qty: "90.0000",
    },
  ],
  holds: [
    {
      reservation_id: 31,
      status: "ACTIVE",
      kind: "HARD_ATP",
      source: "ALLOCATION",
      item_id: 21,
      bom_item_id: 11,
      reserved_qty: "10.0000",
      consumed_qty: "0.0000",
      effective_qty: "10.0000",
      expires_at: null,
      lock_version: 3,
      legacy: false,
    },
  ],
  pegs: [],
};

const preview = (token: string, hold = "40.0000"): AllocationPreview => ({
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  kind: "HARD_ATP",
  expires_at: null,
  order_bom_id: 1,
  order_bom_status: "APPROVED",
  priority_rank: 1,
  state_token: token,
  creates_anything: true,
  warnings: ["HIGHER_PRIORITY_DEMAND_PROTECTED:21"],
  lines: [
    {
      ...allocation.lines[0]!,
      hold_qty: hold,
      pegs: [{ purchase_order_item_id: 41, purchase_order_id: 40, po_code: "PO-40", quantity: "50.0000", expected_date: "2026-11-25", eta_source: "PO" }],
      remaining_short_qty: "0.0000",
    },
  ],
});

const impact: RevisionImpact = {
  window_start: "2026-11-20",
  window_end: "2026-11-30",
  orders_compared: 1,
  deliveries: [
    {
      order_id: 5,
      order_code: "ORD-5",
      target_date: "2026-12-01",
      before: { band: "ON_TRACK", likely_complete_date: "2026-11-28", delay_days: null, reason_codes: [] },
      after: { band: "LATE", likely_complete_date: "2026-12-05", delay_days: 4, reason_codes: [] },
      likely_delta_days: 7,
      band_changed: true,
    },
  ],
  overload: [{ line_id: 1, line_code: "L-01", overload_days_before: 0, overload_days_after: 2, newly_overloaded_dates: ["2026-11-21"] }],
  material_warnings: [],
  summary: { orders_delayed_or_at_risk: 1, lines_with_more_overload: 1, material_warnings: 0 },
  notices: [],
};

const bookingRow: LineBooking = {
  id: 7,
  line_id: 1,
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  style_id: null,
  ob_id: null,
  shift_id: null,
  reservation_status: "SOFT_BOOKED",
  start_date: "2026-11-20",
  planned_end_date: "2026-11-30",
  planned_qty: "1000.000",
  completed_qty: "0.000",
  operator_count: 30,
  target_efficiency_pct: "60.00",
  smv_per_piece: "12.0000",
  source_smv_type: null,
  lock_version: 2,
  schedule_version: 0,
};

const revision: PlanRevision = {
  id: 90,
  revision_no: 3,
  status: "PROPOSED",
  title: "Move ORD-5",
  reason: "Buyer moved the date",
  request_id: "req-1",
  proposed_by_user_id: 2,
  proposed_by_name: "Rahim",
  proposed_at: "2026-11-12T10:00:00",
  decided_by_user_id: null,
  decided_by_name: null,
  decided_at: null,
  decision_note: null,
  applied_at: null,
  impact,
  lock_version: 4,
  can_approve: true,
};

const tentative: TentativeBooking = {
  id: 51,
  line_id: 1,
  line_code: "L-01",
  inquiry_id: null,
  inquiry_code: null,
  quotation_id: 8,
  quotation_code: "QUO-8",
  style_id: null,
  ob_id: null,
  shift_id: null,
  start_date: "2026-11-25",
  planned_end_date: "2026-12-05",
  planned_qty: "500.000",
  smv_per_piece: "10.0000",
  smv_source: "STYLE_STANDARD",
  total_smv_minutes: "5000.00",
  confidence_pct: "40.00",
  weighted_smv_minutes: "2000.00",
  expires_at: "2026-12-31T23:59:00",
  status: "ACTIVE",
  counted: true,
  not_counted_reason: null,
  converted_order_id: null,
  notes: null,
  lock_version: 1,
};

const demand: TentativeDemandResponse = {
  items: [tentative],
  total: 1,
  limit: 200,
  offset: 0,
  counted_count: 1,
  counted_total_smv_minutes: "5000.00",
  counted_weighted_smv_minutes: "2000.00",
};

const employeeRow: EmployeeAssignment = {
  id: 61,
  employee_id: 9,
  employee_code: "E-009",
  employee_name: "Karim",
  sewing_line_id: 1,
  line_code: "L-01",
  shift_id: null,
  shift_code: null,
  role: "OPERATOR",
  valid_from: "2026-11-01",
  valid_to: null,
  is_active: true,
  notes: null,
  lock_version: 5,
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  clientApi.listSewingLines.mockResolvedValue([
    { id: 1, tenant_id: 1, line_code: "L-01", name: "Sewing 1", is_active: true },
    { id: 2, tenant_id: 1, line_code: "L-02", name: "Sewing 2", is_active: true },
  ]);
  clientApi.listProductionShifts.mockResolvedValue([{ id: 1, tenant_id: 1, shift_code: "A", name: "Day", is_active: true }]);
  clientApi.listStyles.mockResolvedValue([]);
  clientApi.listDepartmentMachines.mockResolvedValue([]);
  mp.getConflicts.mockResolvedValue({ items: [], truncated: false });
  mp.getPlanningPermissions.mockResolvedValue({
    can_propose: true,
    can_manage_tentative: true,
    can_manage_assignments: true,
    can_approve: true,
    can_manage_settings: true,
    can_edit_style_smv: true,
    can_allocate: true,
    is_admin_or_manager: false,
    four_eyes: false,
  });
  mp.pickEmployees.mockResolvedValue({ items: [] });
  mi.getSummary.mockReturnValue(new Promise(() => {}));
  mi.getCapacity.mockReturnValue(new Promise(() => {}));
  mi.getLineLoading.mockReturnValue(new Promise(() => {}));
});

async function openRowMenu(rowText: string) {
  const user = userEvent.setup();
  const row = (await screen.findByText(rowText)).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Actions" }));
  return user;
}

describe("ManufacturingIntelligenceSection Phase 2 tabs", () => {
  it("shows no tabs while every Phase 2 flag is off", () => {
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Read-only")).toBeTruthy();
  });

  it("shows Materials only with the allocation flag", () => {
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} phase2={{ allocation: true, integrated: false, fourEyes: false }} />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Materials"]);
  });

  it("shows the planning tabs with the integrated flag and opens one", async () => {
    mp.getTentativeDemand.mockResolvedValue(demand);
    mp.getPlanningSettings.mockResolvedValue({ stage_probability: { INQUIRY: null, QUOTATION: null }, tentative_default_expiry_days: 30, receipt_buffer_days: 2 });
    const user = userEvent.setup();
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} phase2={{ allocation: false, integrated: true, fourEyes: true }} />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Plan changes", "Tentative demand", "People & machines"]);
    expect(screen.getByText("Four-eyes plan approval on")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Tentative demand" }));
    expect(await screen.findByTestId("mfg-tentative-tab")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tentative demand" }).getAttribute("aria-selected")).toBe("true");
  });

  it("passes the planning-permissions hints into the tabs", async () => {
    mp.getPlanningPermissions.mockResolvedValue({
      can_propose: false,
      can_manage_tentative: false,
      can_manage_assignments: false,
      can_approve: false,
      can_manage_settings: false,
      can_edit_style_smv: false,
      can_allocate: false,
      is_admin_or_manager: false,
      four_eyes: false,
    });
    mp.listBookings.mockResolvedValue({ date_from: "", date_to: "", bookings: [bookingRow], tentative_bookings: [], truncated: false, max_rows: 5000 });
    mp.listRevisions.mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} phase2={{ allocation: false, integrated: true, fourEyes: false }} />);
    await waitFor(() => expect(mp.getPlanningPermissions).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Plan changes" }));
    await screen.findByRole("table", { name: "Line bookings" });
    expect(screen.queryByRole("button", { name: "Add booking" })).toBeNull();
  });
});

describe("MaterialsTab", () => {
  it("previews first and confirms with the state token", async () => {
    mp.getOrderAllocation.mockResolvedValue(allocation);
    mp.allocatePreview.mockResolvedValue(preview("tok-1"));
    mp.allocateConfirm.mockResolvedValue({ order_id: 5, kind: "HARD_ATP", status: "ALLOCATED", replayed: false, holds: [{}], pegs: [{}], state_token: "tok-2", after: preview("tok-2") });
    const user = userEvent.setup();
    render(<MaterialsTab orderOptions={orders} orderId={5} onOrderChange={() => {}} roleName="planner" />);
    await screen.findByRole("table", { name: "Material lines" });
    expect(mp.allocateConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Preview allocation" }));
    expect(mp.allocatePreview).toHaveBeenCalledWith(5, { kind: "HARD_ATP" });
    const pv = await screen.findByTestId("mfg-alloc-preview");
    expect(within(pv).getByText(/Preview only - nothing is saved yet/)).toBeTruthy();
    expect(within(pv).getByText(/PO-40: 50/)).toBeTruthy();
    expect(within(pv).getByText("Stock kept for a higher-priority order (21)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm allocation" }));
    expect(mp.allocateConfirm).toHaveBeenCalledWith(5, { kind: "HARD_ATP", state_token: "tok-1" });
    expect(await screen.findByText(/Allocated: 1 hold\(s\) and 1 purchase-order link\(s\) created/)).toBeTruthy();
  });

  it("re-previews automatically when the confirm is stale (409 STALE_STATE)", async () => {
    mp.getOrderAllocation.mockResolvedValue(allocation);
    mp.allocatePreview.mockResolvedValueOnce(preview("tok-1")).mockResolvedValueOnce(preview("tok-9", "20.0000"));
    mp.allocateConfirm.mockRejectedValue(new ApiError("Stock or demand changed since the preview; preview again", 409, null, "STALE_STATE"));
    const user = userEvent.setup();
    render(<MaterialsTab orderOptions={orders} orderId={5} onOrderChange={() => {}} roleName="planner" />);
    await screen.findByRole("table", { name: "Material lines" });
    await user.click(screen.getByRole("button", { name: "Preview allocation" }));
    await screen.findByTestId("mfg-alloc-preview");
    await user.click(screen.getByRole("button", { name: "Confirm allocation" }));
    expect(await screen.findByText(/Stock or demand changed since your preview/)).toBeTruthy();
    await waitFor(() => expect(mp.allocatePreview).toHaveBeenCalledTimes(2));
    await user.click(await screen.findByRole("button", { name: "Confirm allocation" }));
    expect(mp.allocateConfirm).toHaveBeenLastCalledWith(5, { kind: "HARD_ATP", state_token: "tok-9" });
  });

  it("shows the server's refusal message", async () => {
    mp.getOrderAllocation.mockResolvedValue(allocation);
    mp.allocatePreview.mockRejectedValue(new ApiError("The Order BOM must be approved or frozen first", 409, null, "ORDER_BOM_NOT_APPROVED"));
    const user = userEvent.setup();
    render(<MaterialsTab orderOptions={orders} orderId={5} onOrderChange={() => {}} roleName="planner" />);
    await screen.findByRole("table", { name: "Material lines" });
    await user.click(screen.getByRole("button", { name: "Preview allocation" }));
    expect((await screen.findByTestId("mfg-alloc-error")).textContent).toContain("must be approved or frozen first");
  });

  it("keeps hard-hold release and moving material for admin / manager", async () => {
    mp.getOrderAllocation.mockResolvedValue(allocation);
    render(<MaterialsTab orderOptions={orders} orderId={5} onOrderChange={() => {}} roleName="planner" />);
    await screen.findByRole("table", { name: "Material lines" });
    const holdsTable = screen.getByRole("table", { name: "Stock holds" });
    const user = userEvent.setup();
    await user.click(within(holdsTable).getByRole("button", { name: "Actions" }));
    const release = await screen.findByRole("menuitem", { name: "Release (manager only)" });
    expect((release as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("menuitem", { name: "Move to another order" })).toBeNull();
  });

  it("asks a manager for a 10-character reason before releasing a hard hold", async () => {
    mp.getOrderAllocation.mockResolvedValue(allocation);
    mp.releaseReservation.mockResolvedValue({ id: 31, status: "RELEASED", released_qty: "10.0000", remaining_qty: "0.0000", lock_version: 4, changed: true });
    render(<MaterialsTab orderOptions={orders} orderId={5} onOrderChange={() => {}} roleName="manager" />);
    await screen.findByRole("table", { name: "Material lines" });
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("table", { name: "Stock holds" })).getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Move to another order" })).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Release hold" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Release" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Reason/), "Order changed by buyer");
    await user.click(confirm);
    expect(mp.releaseReservation).toHaveBeenCalledWith(31, { reason: "Order changed by buyer", quantity: undefined, expected_lock_version: 3 });
  });
});

describe("PlanChangesTab", () => {
  beforeEach(() => {
    mp.listBookings.mockResolvedValue({ date_from: "", date_to: "", bookings: [bookingRow], tentative_bookings: [], truncated: false, max_rows: 5000 });
    mp.listRevisions.mockResolvedValue({ items: [revision], total: 1 });
  });

  it("hides Add booking and row actions for a user who cannot propose", async () => {
    render(<PlanChangesTab orderOptions={orders} fourEyes={false} canPropose={false} />);
    await screen.findByRole("table", { name: "Line bookings" });
    expect(screen.queryByRole("button", { name: "Add booking" })).toBeNull();
    expect(screen.getByText(/proposing changes needs planning write access/)).toBeTruthy();
  });

  it("collects a change, previews the impact without saving, and proposes once with a request id", async () => {
    mp.previewRevision.mockResolvedValue({ items: [], impact });
    let resolvePropose: (v: PlanRevision) => void = () => {};
    mp.proposeRevision.mockReturnValue(new Promise<PlanRevision>((r) => (resolvePropose = r)));
    render(<PlanChangesTab orderOptions={orders} fourEyes={false} />);
    await screen.findByRole("table", { name: "Line bookings" });
    const user = await openRowMenu("2026-11-20".split("-").reverse().join("/"));
    await user.click(screen.getByRole("menuitem", { name: "Cancel booking" }));
    expect(await screen.findByText(/Cancel ORD-5/)).toBeTruthy();

    // a reason alone is not enough: Propose unlocks only after a preview of the current change set
    await user.type(screen.getByLabelText(/Reason \*/), "Buyer cancelled the line slot");
    const propose = screen.getByRole("button", { name: "Propose for approval" });
    expect((propose as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Preview impact" }));
    expect(mp.previewRevision).toHaveBeenCalledWith([{ action: "CANCEL", config_id: 7 }]);
    const view = await screen.findByTestId("mfg-impact");
    expect(within(view).getByText("Preview only - nothing is saved yet")).toBeTruthy();
    expect(within(view).getByText("+7 days")).toBeTruthy();
    expect(mp.proposeRevision).not.toHaveBeenCalled();

    expect((propose as HTMLButtonElement).disabled).toBe(false);
    await user.click(propose);
    await user.click(screen.getByRole("button", { name: "Sending…" }));
    expect(mp.proposeRevision).toHaveBeenCalledTimes(1);
    const body = mp.proposeRevision.mock.calls[0]![0];
    expect(body.items).toEqual([{ action: "CANCEL", config_id: 7 }]);
    expect(body.reason).toBe("Buyer cancelled the line slot");
    expect(typeof body.request_id).toBe("string");
    resolvePropose({ ...revision, id: 91 });
    expect(await screen.findByText(/waits for approval/)).toBeTruthy();
  });

  it("explains a stale approve (409)", async () => {
    mp.approveRevision.mockRejectedValue(new ApiError("The revision changed since you loaded it. Reload and review it again", 409));
    render(<PlanChangesTab orderOptions={orders} fourEyes />);
    const user = await openRowMenu("Move ORD-5");
    await user.click(screen.getByRole("menuitem", { name: "Approve & apply" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve & apply" }));
    expect(mp.approveRevision).toHaveBeenCalledWith(90, { expected_lock_version: 4, decision_note: undefined });
    // the dialog closes and the lists reload, so the next try uses the fresh lock version
    expect(await screen.findByText(/the list was reloaded - review it again/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mp.listRevisions.mock.calls.length).toBeGreaterThan(1);
  });

  it("explains the four-eyes rule on a 403", async () => {
    mp.approveRevision.mockRejectedValue(new ApiError("Four-eyes rule: the person who proposed a plan change cannot approve it", 403));
    render(<PlanChangesTab orderOptions={orders} fourEyes />);
    const user = await openRowMenu("Move ORD-5");
    await user.click(screen.getByRole("menuitem", { name: "Approve & apply" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve & apply" }));
    expect(await within(dialog).findByText(/someone other than the proposer must approve/)).toBeTruthy();
  });

  it("requires a decision note to reject", async () => {
    mp.rejectRevision.mockResolvedValue({ ...revision, status: "REJECTED", changed: true });
    render(<PlanChangesTab orderOptions={orders} fourEyes={false} />);
    const user = await openRowMenu("Move ORD-5");
    await user.click(screen.getByRole("menuitem", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    const btn = within(dialog).getByRole("button", { name: "Reject" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Decision note/), "Line is full");
    await user.click(btn);
    expect(mp.rejectRevision).toHaveBeenCalledWith(90, { decision_note: "Line is full" });
  });
});

describe("TentativeDemandTab", () => {
  beforeEach(() => {
    mp.getTentativeDemand.mockResolvedValue(demand);
    mp.getPlanningSettings.mockResolvedValue({ stage_probability: { INQUIRY: null, QUOTATION: "50.00" }, tentative_default_expiry_days: 30, receipt_buffer_days: 2, is_default: false });
  });

  it("says tentative demand is soft load and shows the counted totals", async () => {
    render(<TentativeDemandTab />);
    expect(screen.getByText(/never reduces firm capacity or promise dates/)).toBeTruthy();
    const totals = await screen.findByTestId("mfg-tentative-totals");
    expect(within(totals).getByText("2,000")).toBeTruthy();
    expect(screen.getByText("Quotation QUO-8")).toBeTruthy();
    expect(screen.getByText("Counted")).toBeTruthy();
  });

  it("edits with the lock version and only the changed fields, and shows a 409", async () => {
    mp.updateTentativeBooking.mockRejectedValue(new ApiError("An order already exists for this inquiry / quotation; book the order instead", 409));
    render(<TentativeDemandTab />);
    const user = await openRowMenu("Quotation QUO-8");
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const qty = await screen.findByLabelText(/Planned quantity/);
    await user.clear(qty);
    await user.type(qty, "600");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mp.updateTentativeBooking).toHaveBeenCalledWith(51, { expected_lock_version: 1, planned_qty: "600" });
    expect(await screen.findByText(/An order already exists/)).toBeTruthy();
  });

  it("confirms before cancelling", async () => {
    mp.cancelTentativeBooking.mockResolvedValue({ ...tentative, status: "CANCELLED", changed: true });
    render(<TentativeDemandTab />);
    const user = await openRowMenu("Quotation QUO-8");
    await user.click(screen.getByRole("menuitem", { name: "Cancel booking" }));
    expect(mp.cancelTentativeBooking).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(mp.cancelTentativeBooking).toHaveBeenCalledWith(51);
  });
});

describe("PeopleMachinesTab", () => {
  it("lists assignments by code and name and deactivates with the lock version (stale 409 shown)", async () => {
    mp.listAssignments.mockResolvedValue({ items: [employeeRow], total: 1, limit: 100, offset: 0 });
    mp.deactivateAssignment.mockRejectedValue(new ApiError("The assignment changed since you loaded it. Reload and try again", 409));
    render(<PeopleMachinesTab />);
    expect(await screen.findByText("E-009 · Karim")).toBeTruthy();
    expect(mp.listAssignments).toHaveBeenCalledWith("employees", expect.objectContaining({ limit: 100, offset: 0 }));
    const user = await openRowMenu("E-009 · Karim");
    await user.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    expect(mp.deactivateAssignment).toHaveBeenCalledWith("employees", 61, { expected_lock_version: 5, reason: undefined });
    // stale: the dialog closes and the list reloads so the next try uses the fresh lock version
    expect(await screen.findByText(/changed since you opened it; the list was reloaded/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mp.listAssignments.mock.calls.length).toBeGreaterThan(1);
  });

  it("picks people with the planner search (code + name), never the HR employee list", async () => {
    mp.listAssignments.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    mp.pickEmployees.mockResolvedValue({ items: [{ id: 9, employee_code: "E-009", employee_name: "Karim" }] });
    render(<PeopleMachinesTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Assign a person" }));
    await user.click(await screen.findByLabelText("Person"));
    expect(await screen.findByText("E-009 · Karim")).toBeTruthy();
    expect(mp.pickEmployees).toHaveBeenCalled();
    expect(clientApi.listHrEmployees).not.toHaveBeenCalled();
  });

  it("hides Assign for a user without planning write access", async () => {
    mp.listAssignments.mockResolvedValue({ items: [employeeRow], total: 1, limit: 100, offset: 0 });
    render(<PeopleMachinesTab canWrite={false} />);
    expect(await screen.findByText("E-009 · Karim")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign a person" })).toBeNull();
  });

  it("shows a load error from the server", async () => {
    mp.listAssignments.mockRejectedValue(new ApiError("Permission denied: production.planning.read", 403));
    render(<PeopleMachinesTab />);
    expect(await screen.findByText(/Permission denied: production.planning.read/)).toBeTruthy();
  });
});
