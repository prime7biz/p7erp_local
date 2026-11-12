// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));

const api = vi.hoisted(() => ({
  listOrdersPaginated: vi.fn(),
  getOrdersPlanningGroundingSummary: vi.fn(),
  listQuotationsPaginated: vi.fn(),
  updateOrder: vi.fn(),
  deleteOrder: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));
vi.mock("@/components/app/data-grid/SavedViewsMenu", () => ({ SavedViewsMenu: () => null }));
vi.mock("@/components/app/RemoteSearchSelect", () => ({ RemoteSearchSelect: () => <input aria-label="Customer" /> }));
vi.mock("@/components/SecureImage", () => ({ SecureImage: () => null }));
vi.mock("@/lib/remoteSelectFetchers", () => ({ fetchCustomerPage: vi.fn(), hydrateCustomer: vi.fn() }));

import { OrdersPage } from "./OrdersPage";

const order = {
  id: 11,
  order_code: "ORD-0011",
  customer_id: 3,
  customer_name: "Acme Apparel",
  quotation_id: null,
  style_ref: "ST-1",
  status: "DRAFT",
  quantity: 1200,
  delivery_date: "2026-12-20",
  commission_mode: null,
  commission_type: null,
  commission_value: null,
};

function mockPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px") ? isPhone : query.includes("1023px") ? isPhone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  flags = {};
  localStorage.clear();
  api.listOrdersPaginated.mockResolvedValue({ items: [order], total: 1, page: 1 });
  api.getOrdersPlanningGroundingSummary.mockResolvedValue([]);
  api.listQuotationsPaginated.mockResolvedValue({ items: [] });
  api.updateOrder.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

async function openEditOnCard() {
  const user = userEvent.setup();
  const link = await screen.findByRole("link", { name: "ORD-0011" });
  const card = link.closest("li") as HTMLElement;
  await user.click(within(card).getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  return user;
}

describe("OrdersPage on a phone (mobile_ui_v2)", () => {
  it("shows order cards with the code link, customer and status", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    renderPage();
    const link = await screen.findByRole("link", { name: "ORD-0011" });
    expect(link.getAttribute("href")).toBe("/app/orders/11");
    const card = link.closest("li") as HTMLElement;
    expect(within(card).getByText("Acme Apparel")).toBeTruthy();
    expect(within(card).getByText("DRAFT")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("edit dialog: one column, commission folded, scrollable panel, sticky Save, same payload", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    renderPage();
    const user = await openEditOnCard();
    const heading = await screen.findByRole("heading", { name: "Edit order" });
    const panel = heading.parentElement as HTMLElement;
    expect(panel.className).toContain("overflow-y-auto");
    const fold = screen.getByText("Commission details (optional)").closest("details") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.parentElement?.className).toContain("sticky");
    await user.click(save);
    expect(api.updateOrder).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ customer_id: 3, style_ref: "ST-1", quantity: 1200, status: "DRAFT" }),
    );
  });

  it("keeps the commission fold open while the user clears the value", async () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    api.listOrdersPaginated.mockResolvedValue({
      items: [{ ...order, commission_value: "2.5" }],
      total: 1,
      page: 1,
    });
    renderPage();
    const user = await openEditOnCard();
    const fold = screen.getByText("Commission details (optional)").closest("details") as HTMLDetailsElement;
    expect(fold.open).toBe(true);
    const value = within(fold).getByDisplayValue("2.5");
    await user.clear(value);
    expect(fold.open).toBe(true);
  });

  it("keeps today's table and dialog when the switch is off", async () => {
    mockPhone(true);
    renderPage();
    const link = await screen.findByRole("link", { name: "ORD-0011" });
    expect(link.closest("tr")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(link.closest("tr") as HTMLElement).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit order" });
    expect(screen.queryByText("Commission details (optional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).parentElement?.className).not.toContain("sticky");
  });
});
