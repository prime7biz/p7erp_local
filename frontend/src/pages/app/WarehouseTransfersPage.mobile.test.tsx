// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));

const api = vi.hoisted(() => ({
  listWarehouseTransfers: vi.fn(),
  postWarehouseTransfer: vi.fn(),
  getWarehouseTransferPrintData: vi.fn(),
  getWarehouseTransferGlPostings: vi.fn(),
  createWarehouseTransfer: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));
vi.mock("@/lib/masterData", () => ({
  getWarehousesCached: () =>
    Promise.resolve([
      { id: 1, warehouse_code: "WH1", name: "Main" },
      { id: 2, warehouse_code: "WH2", name: "Annex" },
    ]),
}));
vi.mock("@/lib/remoteSelectFetchers", () => ({ fetchInventoryItemPage: vi.fn(), hydrateInventoryItem: vi.fn() }));
vi.mock("@/components/app/RemoteSearchSelect", () => ({ RemoteSearchSelect: () => <input aria-label="Item" /> }));

import { WarehouseTransfersPage } from "./WarehouseTransfersPage";

const transfers = [
  {
    id: 7,
    transfer_code: "WT-0007",
    from_warehouse_id: 1,
    to_warehouse_id: 2,
    transfer_date: "2026-11-01",
    status: "DRAFT",
    items: [{ id: 1, item_id: 5, item_code: "FAB", item_name: "Fabric", quantity: "10" }],
  },
];

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
  api.listWarehouseTransfers.mockResolvedValue(transfers);
  api.postWarehouseTransfer.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("WarehouseTransfersPage on a phone (mobile_ui_v2)", () => {
  it("shows cards with the shared Actions menu, and Post to stock still posts the transfer", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    const user = userEvent.setup();
    render(<WarehouseTransfersPage />);
    const code = await screen.findByText("WT-0007");
    const card = code.closest("li") as HTMLElement;
    expect(card).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(within(card).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Post to stock" }));
    expect(api.postWarehouseTransfer).toHaveBeenCalledWith(7);
  });

  it("folds the optional Notes and keeps Save draft in a sticky bar", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    const { container } = render(<WarehouseTransfersPage />);
    await screen.findByText("WT-0007");
    expect(screen.getByText("Notes (optional)")).toBeTruthy();
    expect(container.querySelector("details")?.open).toBe(false);
    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save.parentElement?.className).toContain("sticky");
    expect(screen.getByLabelText("Quantity").getAttribute("inputmode")).toBe("decimal");
  });

  it("keeps today's table and form when the switch is off", async () => {
    mockPhone(true);
    render(<WarehouseTransfersPage />);
    await screen.findByText("WT-0007");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByText("Notes (optional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" }).parentElement?.className ?? "").not.toContain("sticky");
  });
});
