// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CapacityDay,
  CapacityResponse,
  DeliveryPredictionResponse,
  LineLoadingResponse,
  MfgSummaryResponse,
  ReadinessResponse,
} from "@/api/manufacturingIntelligence";

const getSummary = vi.fn();
const getCapacity = vi.fn();
const getLineLoading = vi.fn();
const getReadiness = vi.fn();
const getDeliveryPrediction = vi.fn();

vi.mock("@/api/manufacturingIntelligence", () => ({
  manufacturingIntelligenceApi: {
    getSummary: (...a: unknown[]) => getSummary(...a),
    getCapacity: (...a: unknown[]) => getCapacity(...a),
    getLineLoading: (...a: unknown[]) => getLineLoading(...a),
    getReadiness: (...a: unknown[]) => getReadiness(...a),
    getDeliveryPrediction: (...a: unknown[]) => getDeliveryPrediction(...a),
  },
}));

import { ManufacturingIntelligenceSection } from "./ManufacturingIntelligenceSection";

const day = (date: string, status: string, extra: Partial<CapacityDay> = {}): CapacityDay => ({
  date,
  is_working_day: status !== "CLOSED",
  theoretical_minutes: null,
  practical_smv_minutes: status === "UNKNOWN" ? null : "1000",
  firm_smv_minutes: "0",
  soft_smv_minutes: "0",
  draft_smv_minutes: "0",
  firm_confirmed_smv_minutes: "0",
  firm_unconfirmed_smv_minutes: "0",
  firm_available_smv_minutes: null,
  utilization_pct: null,
  status,
  reason_codes: status === "CLOSED" ? ["CLOSED_DAY"] : [],
  missing_inputs: status === "UNKNOWN" ? ["operators"] : [],
  operators: null,
  efficiency_pct: null,
  smv_per_piece: null,
  theoretical_units: null,
  practical_units: null,
  ...extra,
});

const capacity: CapacityResponse = {
  date_from: "2026-11-12",
  date_to: "2026-11-14",
  formula_version: "v2",
  planning_math_v2: false,
  legacy_basis: "ADVISORY",
  legacy_working_days: 26,
  legacy_average_shift_minutes: "480",
  lines: [
    {
      line_id: 1,
      line_code: "L-01",
      name: "Sewing 1",
      factory_unit: null,
      days: [day("2026-11-12", "OVERLOADED", { firm_smv_minutes: "1200" }), day("2026-11-13", "CLOSED"), day("2026-11-14", "UNKNOWN")],
      totals: {
        practical_smv_minutes: null,
        firm_smv_minutes: "1200",
        soft_smv_minutes: "0",
        draft_smv_minutes: "0",
        firm_available_smv_minutes: null,
        utilization_pct: null,
        working_days_known: 1,
        working_days_unknown: 1,
        closed_days: 1,
      },
      legacy_value: "12480",
      corrected_value: null,
      corrected_complete: null,
      difference: null,
      notice: null,
      reason_codes: ["PLANNING_MATH_V2_OFF", "SHIFT_ASSUMED_ALL_ACTIVE"],
      missing_inputs: [],
    },
  ],
  totals: { legacy_value: "12480", corrected_value: null, corrected_complete: null, difference: null },
  notices: [],
  assumptions: [],
};

const lineLoading: LineLoadingResponse = {
  date_from: "2026-11-12",
  date_to: "2026-11-14",
  rows: [],
  unresolved_rows: [
    { config_id: 77, line_id: 1, order_id: 5, reservation_status: "FIRM_BOOKED", remaining_qty: "100", reason_codes: ["SMV_UNKNOWN"], missing_inputs: [] },
  ],
  line_days: [],
  truncated: false,
  notices: [],
};

const summary: MfgSummaryResponse = {
  date_from: "2026-11-12",
  date_to: "2026-11-14",
  factory_unit: null,
  flags: { planning_math_v2: false, mfg_order_bom_readiness_v2: true },
  capacity: {
    practical_smv_minutes: null,
    firm_smv_minutes: "1200",
    soft_smv_minutes: "300",
    draft_smv_minutes: "0",
    firm_available_smv_minutes: null,
    utilization_pct: null,
    unknown_line_days: 1,
    line_count: 1,
  },
  overloaded: { count: 1, top: [] },
  idle: { count: 0, top: [] },
  orders: {
    confirmed_total: 9,
    evaluated: 9,
    truncated: false,
    readiness_quick_check: { firm_booked: 3, soft_or_draft_only: 2, not_booked: 4 },
    delivery_risk: { ON_TRACK: 2, AT_RISK: 3, LATE: 1, COMPLETE: 0, UNKNOWN: 3 },
  },
  notices: [],
};

const readiness: ReadinessResponse = {
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  mode: "ORDER_BOM_V2",
  material_authority: "ORDER_BOM",
  mfg_order_bom_readiness_v2: true,
  dimensions: [
    { key: "materials_ready", label: "Materials ready", status: "BLOCKED", reason_codes: ["MATERIAL_SHORT"], detail: null, informational: false },
    { key: "financially_supported", label: "Financially supported", status: "NOT_EVALUATED", reason_codes: ["FINANCE_NOT_EVALUATED_PHASE1"], detail: null, informational: true },
  ],
  blockers: [{ dimension: "materials_ready", reason: "MATERIAL_SHORT", department: "Purchasing", detail: null }],
  info: [{ dimension: "materials_ready", reason: "SHARED_SUPPLY_NOT_ALLOCATED", detail: null }],
  material_lines: [
    {
      bom_item_id: 1,
      item_id: 2,
      item_name: "Fabric A",
      category: null,
      uom: "m",
      required_qty: "100.0000",
      requirement_source: "X",
      on_hand_qty: "10",
      in_transit_qty: "0",
      available_qty: "10.0000",
      short_qty: "90.0000",
      ready: false,
    },
  ],
  material_lines_truncated: false,
  order_bom: { bom_id: 1, status: "APPROVED" },
  legacy: null,
  assumptions: [],
};

const prediction: DeliveryPredictionResponse = {
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  target_date: "2026-12-01",
  target_basis: "EX_FACTORY",
  order_qty: "1000",
  produced_qty: "0",
  hourly_good_qty: null,
  remaining_qty: "1000",
  start_date: null,
  likely_complete_date: null,
  optimistic_complete_date: null,
  pessimistic_complete_date: null,
  working_days_needed: null,
  daily_rate_likely: null,
  daily_rate_optimistic: null,
  daily_rate_pessimistic: null,
  delay_days: null,
  early_days: null,
  band: "UNKNOWN",
  reason_codes: ["PLANNING_MATH_V2_OFF"],
  missing_inputs: [],
  lines: [],
  material: null,
  assumptions: [],
};

const orders = [{ order_id: 5, order_code: "ORD-5", customer_name: "Acme" }];

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  getSummary.mockResolvedValue(summary);
  getCapacity.mockResolvedValue(capacity);
  getLineLoading.mockResolvedValue(lineLoading);
  getReadiness.mockResolvedValue(readiness);
  getDeliveryPrediction.mockResolvedValue(prediction);
});

describe("ManufacturingIntelligenceSection", () => {
  it("renders nothing and fetches nothing when the flag is off", () => {
    const { container } = render(<ManufacturingIntelligenceSection enabled={false} orderOptions={orders} />);
    expect(container.innerHTML).toBe("");
    expect(getSummary).not.toHaveBeenCalled();
    expect(getCapacity).not.toHaveBeenCalled();
  });

  it("shows legacy vs corrected labels, UNKNOWN and readable reasons", async () => {
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    expect(await screen.findByText("Legacy (current formula)")).toBeTruthy();
    expect(screen.getByText("Corrected preview")).toBeTruthy();
    const panel = screen.getByTestId("mfg-capacity-panel");
    expect(within(panel).getAllByText("UNKNOWN").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Shift assumed: all active shifts")).toBeTruthy();
    expect(within(panel).getByText(/Corrected maths is off\./)).toBeTruthy();
    expect(screen.getByText("Readiness uses order BOM")).toBeTruthy();
  });

  it("renders the line grid with letters and accessible labels, and unresolved rows", async () => {
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    const grid = await screen.findByLabelText(/Line loading grid/);
    const cells = within(grid).getAllByRole("img");
    expect(cells).toHaveLength(3);
    expect(cells[0]!.getAttribute("data-status")).toBe("OVERLOADED");
    expect((cells[0])?.textContent).toContain("O");
    expect((cells[1])?.textContent).toContain("–");
    expect((cells[2])?.textContent).toContain("?");
    expect(cells[0]!.getAttribute("aria-label")).toContain("Firm 1,200 min");
    const unresolved = await screen.findByTestId("mfg-unresolved-rows");
    expect(within(unresolved).getByText("SMV unknown")).toBeTruthy();
  });

  it("shows the delivery band counts from the summary", async () => {
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    const bands = await screen.findByTestId("mfg-delivery-bands");
    expect((within(bands).getByText("On track").nextSibling)?.textContent).toContain("2");
    expect((within(bands).getByText("At risk").nextSibling)?.textContent).toContain("3");
    expect((within(bands).getByText("Late").nextSibling)?.textContent).toContain("1");
    expect((within(bands).getByText("Unknown").nextSibling)?.textContent).toContain("3");
  });

  it("shows readiness blockers apart from information, and the delivery target for the picked order", async () => {
    const user = userEvent.setup();
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    await screen.findByTestId("mfg-delivery-bands");
    await user.selectOptions(screen.getByLabelText("Order"), "5");

    const blockers = await screen.findByTestId("mfg-blockers");
    expect(within(blockers).getByText(/Purchasing/)).toBeTruthy();
    expect(within(blockers).getByText(/Material is short/)).toBeTruthy();
    const info = screen.getByTestId("mfg-info");
    expect(within(info).getByText(/not yet allocated between orders/)).toBeTruthy();
    expect(within(blockers).queryByText(/not yet allocated/)).toBeNull();
    expect(screen.getByText("Material basis: Order BOM")).toBeTruthy();

    const detail = await screen.findByTestId("mfg-delivery-detail");
    expect(within(detail).getByText("Ex-factory target")).toBeTruthy();
    expect(within(detail).getByText("01/12/2026")).toBeTruthy();
    expect(within(detail).getByText("Corrected maths is off")).toBeTruthy();
    await waitFor(() => expect(getReadiness).toHaveBeenCalledWith(5));
  });

  it("shows the API error inside the panel when the server refuses (403 / 404)", async () => {
    getCapacity.mockRejectedValue(new Error("Permission denied: production.planning.read"));
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    const panel = await screen.findByTestId("mfg-capacity-panel");
    expect(await within(panel).findByText(/Permission denied: production.planning.read/)).toBeTruthy();
    expect(within(panel).queryByText("Legacy (current formula)")).toBeNull();
  });

  it("does not call the API for a window longer than 180 days", async () => {
    const user = userEvent.setup();
    render(<ManufacturingIntelligenceSection enabled orderOptions={orders} />);
    await screen.findByTestId("mfg-delivery-bands");
    getCapacity.mockClear();
    const to = screen.getByLabelText("Window to");
    await user.clear(to);
    await user.type(to, "2030-01-01");
    expect(await screen.findByText(/at most 180 days/)).toBeTruthy();
    expect(getCapacity).not.toHaveBeenCalled();
  });
});
