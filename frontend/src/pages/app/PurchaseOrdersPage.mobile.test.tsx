// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));

const api = vi.hoisted(() => ({
  listPurchaseOrdersPaginated: vi.fn(),
  bulkPurchaseOrderStatus: vi.fn(),
  createPurchaseOrder: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));
vi.mock("@/lib/masterData", () => ({
  getInventoryItemsCached: () => Promise.resolve([{ id: 5, name: "Cotton fabric" }]),
  getWarehousesCached: () => Promise.resolve([{ id: 1, name: "Main" }]),
  getVendorsCached: () => Promise.resolve([]),
}));
vi.mock("@/components/app/data-grid/SavedViewsMenu", () => ({ SavedViewsMenu: () => null }));
vi.mock("@/components/app/RemoteSearchSelect", () => ({ RemoteSearchSelect: (p: { "aria-label"?: string }) => <input aria-label={p["aria-label"]} /> }));
vi.mock("@/lib/remoteSelectFetchers", () => ({
  fetchInventoryItemPage: vi.fn(),
  fetchVendorPage: vi.fn(),
  hydrateInventoryItem: vi.fn(),
  hydrateVendor: vi.fn(),
}));

import { PurchaseOrdersPage } from "./PurchaseOrdersPage";

const po = (id: number, code: string) => ({
  id,
  po_code: code,
  supplier_name: "Dhaka Textiles",
  vendor_id: null,
  currency: "USD",
  status: "DRAFT",
  items: [{ item_id: 5, quantity: "100" }],
});

function mockPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px") ? isPhone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PurchaseOrdersPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  flags = {};
  localStorage.clear();
  api.listPurchaseOrdersPaginated.mockResolvedValue({ items: [po(1, "PO-0001"), po(2, "PO-0002")], total: 2 });
  api.bulkPurchaseOrderStatus.mockResolvedValue({ updated: 2, skipped: [] });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("PurchaseOrdersPage on a phone (mobile_ui_v2)", () => {
  it("shows PO cards and runs bulk Approve on the selected cards", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    const user = userEvent.setup();
    renderPage();
    const code = await screen.findByText("PO-0001");
    const card = code.closest("li") as HTMLElement;
    expect(within(card).getByText("Dhaka Textiles")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Actions" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(api.bulkPurchaseOrderStatus).toHaveBeenCalledWith([1, 2], "APPROVED", undefined);
  });

  it("folds BTB LC and notes, labels the dates, and keeps Create in a sticky bar", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    renderPage();
    await screen.findByText("PO-0001");
    const fold = screen.getByText("BTB LC and notes (optional)").closest("details") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(within(fold).getByPlaceholderText("Notes")).toBeTruthy();
    expect(screen.getByLabelText("Order date")).toBeTruthy();
    expect(screen.getByLabelText("FX rate to base").getAttribute("inputmode")).toBe("decimal");
    expect(screen.getByRole("button", { name: "Create Purchase Order" }).parentElement?.className).toContain("sticky");
  });

  it("keeps today's table and form when the switch is off", async () => {
    mockPhone(true);
    renderPage();
    await screen.findByText("PO-0001");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByText("BTB LC and notes (optional)")).toBeNull();
    expect(screen.getByPlaceholderText("BTB LC ID (optional)")).toBeTruthy();
  });
});
