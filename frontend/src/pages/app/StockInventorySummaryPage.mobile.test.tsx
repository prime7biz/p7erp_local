// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));

const api = vi.hoisted(() => ({
  getStockSummaryOverview: vi.fn(),
  getStockSummaryByGroup: vi.fn(),
  getStockSummaryByWarehouse: vi.fn(),
  getStockSummaryWip: vi.fn(),
  postFifoRebuild: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { StockInventorySummaryPage } from "./StockInventorySummaryPage";

const line = {
  item_id: 9,
  warehouse_id: 1,
  item_code: "FAB-01",
  item_name: "Cotton fabric",
  warehouse_name: "Main store",
  on_hand_qty: "120",
  unit_cost: "2.50",
  line_value: "300.00",
};

function mockPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px") ? isPhone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  flags = {};
  localStorage.clear();
  api.getStockSummaryOverview.mockResolvedValue({ stock_on_hand_value: 300, wip_value: 0, grand_total: 300 });
  api.getStockSummaryByGroup.mockResolvedValue({
    groups: [{ stock_group_id: 1, stock_group_name: "Fabrics", total_qty: 120, total_value: 300, lines: [line] }],
  });
  api.getStockSummaryByWarehouse.mockResolvedValue({ warehouses: [] });
  api.getStockSummaryWip.mockResolvedValue({ rows: [], total_wip_value: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StockInventorySummaryPage />
    </MemoryRouter>,
  );
}

describe("StockInventorySummaryPage on a phone (mobile_ui_v2)", () => {
  it("shows grouped cards under the group total, each opening the item", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "By group" }));
    expect(await screen.findByText(/Qty 120 · Value 300/)).toBeTruthy();
    const card = screen.getByRole("link", { name: /FAB-01 — Cotton fabric/ });
    expect(card.getAttribute("href")).toBe("/app/inventory?tab=items&item=9");
    expect(within(card).getByText("300.00")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("keeps the tables when the switch is off", async () => {
    mockPhone(true);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "By group" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "List layout" })).toBeNull();
  });
});
