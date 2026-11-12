// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CT_ME, orderList, orderRow, profit } from "@/components/finance/control/controlTestFixtures";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  api: { getControlTower: vi.fn(), getExceptions: vi.fn(), listOrderProfit: vi.fn(), getProfitability: vi.fn() },
  customers: vi.fn(),
  getStyle: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeControl", async () => {
  const actual = await vi.importActual<typeof import("@/api/financeControl")>("@/api/financeControl");
  return { ...actual, financeControlApi: h.api };
});
vi.mock("@/api/client", () => ({ api: { listCustomersPaginated: h.customers } }));
vi.mock("@/api/merch", () => ({ merchApi: { listStylesWithTotal: vi.fn().mockResolvedValue({ rows: [], total: 0 }), getStyle: h.getStyle } }));
vi.mock("@/api/commercial", () => ({ commercialApi: { listMasterContracts: vi.fn().mockResolvedValue([]), getMasterContract: vi.fn() } }));
vi.mock("@/lib/remoteSelectFetchers", () => ({
  fetchCustomerPage: vi.fn().mockResolvedValue({ options: [], total: 0 }),
  hydrateCustomer: vi.fn().mockResolvedValue(null),
}));

import { EntityProfitabilityGlPage } from "./EntityProfitabilityGlPage";
import { OrderProfitabilityGlPage } from "./OrderProfitabilityGlPage";

function renderPage(ui: React.ReactElement, initial = "/app/finance/profitability/orders") {
  return render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);
}

beforeEach(() => {
  h.me = { ...CT_ME };
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.customers.mockReset();
  h.customers.mockResolvedValue({ items: [{ id: 3, name: "H&M Sweden" }], total: 1 });
  h.getStyle.mockReset();
  h.getStyle.mockResolvedValue({ id: 7, style_code: "ST-07", name: "Polo" });
  h.api.listOrderProfit.mockResolvedValue(orderList([orderRow(5), orderRow(6, { margin_percent: null, revenue: "0.0000", order_code: "ORD-006" })]));
});
afterEach(cleanup);

describe("Order P&L (GL) page", () => {
  it("lists orders with every profit column, the buyer name and a lakh/crore unattributed total", async () => {
    renderPage(<OrderProfitabilityGlPage />);
    await screen.findByText("ORD-005");
    expect(await screen.findAllByText("H&M Sweden")).toHaveLength(2);
    for (const heading of ["Order", "Buyer", "Revenue", "Material", "CM", "Other", "Overhead", "Finance cost", "Gross", "Nett", "Margin %", "Unattributed"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(`^${heading}`) })).toBeInTheDocument();
    }
    const row = screen.getByText("ORD-005").closest("tr")!;
    expect(row).toHaveTextContent("1,000.00");
    expect(row).toHaveTextContent("42.00%");
    expect(screen.getByTestId("unattributed-total")).toHaveTextContent("1,81,38,63,870.26");
    expect(screen.getByTestId("unattributed-row")).toHaveTextContent("4 ledger line(s)");
  });

  it("shows a dash instead of 0% when the margin is null", async () => {
    renderPage(<OrderProfitabilityGlPage />);
    const row = (await screen.findByText("ORD-006")).closest("tr")!;
    expect(row).toHaveTextContent("—");
    expect(row.textContent).not.toContain("0.00%");
  });

  it("sorts with allowlisted fields only: ascending first, then descending", async () => {
    renderPage(<OrderProfitabilityGlPage />);
    await screen.findByText("ORD-005");
    expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "order_code", offset: 0, limit: 25 }));
    fireEvent.click(screen.getByRole("button", { name: /^Revenue/ }));
    await waitFor(() => expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "revenue" })));
    fireEvent.click(screen.getByRole("button", { name: /^Revenue/ }));
    await waitFor(() => expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "-revenue" })));
    fireEvent.click(screen.getByRole("button", { name: /^Margin %/ }));
    await waitFor(() => expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "margin_percent" })));
    // Columns the backend cannot sort by are plain headings, not buttons.
    expect(screen.queryByRole("button", { name: /^Material/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buyer/ })).toBeNull();
    const sorts = h.api.listOrderProfit.mock.calls.map((c) => String((c[0] as { sort: string }).sort).replace(/^-/, ""));
    expect(new Set(sorts)).toEqual(new Set(["order_code", "revenue", "margin_percent"]));
  });

  it("pages 25 orders at a time and returns to the first page when the sort changes", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => orderRow(i + 1, { order_code: `ORD-${String(i + 1).padStart(3, "0")}` }));
    h.api.listOrderProfit.mockResolvedValue(orderList(rows, { total: 40 }));
    renderPage(<OrderProfitabilityGlPage />);
    await screen.findByText("ORD-001");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    fireEvent.click(screen.getByRole("button", { name: /^Nett/ }));
    await waitFor(() => expect(h.api.listOrderProfit).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "nett_profit", offset: 0 })));
  });

  it("opens a detail panel with budget and actual side by side, coverage and the warning banner", async () => {
    h.api.getProfitability.mockResolvedValue(
      profit({ warnings: [{ code: "UNCLASSIFIED_ACCOUNTS", count: 2, amount: "150.0000" }], unattributed_actual: "75.0000" }),
    );
    renderPage(<OrderProfitabilityGlPage />);
    fireEvent.click(await screen.findByRole("button", { name: "ORD-005" }));
    const dialog = await screen.findByRole("dialog", { name: "Order profit detail" });
    await within(dialog).findByTestId("profit-detail");
    expect(h.api.getProfitability).toHaveBeenCalledWith("orders", 5, expect.objectContaining({ from_date: expect.any(String), to_date: expect.any(String) }));
    const revenue = within(dialog).getByText("Revenue").closest("tr")!;
    expect(revenue).toHaveTextContent("1,000.00"); // budget
    expect(revenue).toHaveTextContent("1,200.00"); // actual
    expect(revenue).toHaveTextContent("200.00"); // actual - budget
    expect(within(dialog).getByText("Overhead").closest("tr")).toHaveTextContent("—"); // no budget for overhead
    expect(within(dialog).getByTestId("detail-margin")).toHaveTextContent("47.50%");
    expect(within(dialog).getByTestId("detail-coverage")).toHaveTextContent("Lines linked straight to the order: 7");
    expect(within(dialog).getByTestId("detail-coverage")).toHaveTextContent("Lines with no order or contract link: 3");
    expect(within(dialog).getByTestId("detail-unattributed")).toHaveTextContent("75.00");
    const banner = within(dialog).getByTestId("profit-warnings");
    expect(within(banner).getByRole("link", { name: /Account Groups/ })).toHaveAttribute("href", "/app/accounts/groups");
  });

  it("offers Style, Contract and Buyer P&L in the row Actions menu", async () => {
    renderPage(<OrderProfitabilityGlPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for ORD-005" }));
    expect(screen.getByRole("menuitem", { name: "Style P&L" })).toHaveAttribute("href", "/app/finance/profitability/entity?kind=styles&id=11");
    expect(screen.getByRole("menuitem", { name: "Contract / LC P&L" })).toHaveAttribute(
      "href",
      "/app/finance/profitability/entity?kind=master-contracts&id=21",
    );
    expect(screen.getByRole("menuitem", { name: "Buyer P&L" })).toHaveAttribute("href", "/app/finance/profitability/entity?kind=buyers&id=3");
  });

  it("shows an empty state, an error with Retry, and a switched-off message", async () => {
    h.api.listOrderProfit.mockResolvedValueOnce(orderList([]));
    const first = renderPage(<OrderProfitabilityGlPage />);
    expect(await screen.findByText("No orders for this period.")).toBeInTheDocument();
    first.unmount();

    h.api.listOrderProfit.mockReset();
    h.api.listOrderProfit.mockRejectedValueOnce(Object.assign(new Error("Server exploded"), { status: 500 }));
    h.api.listOrderProfit.mockResolvedValue(orderList([orderRow(5)]));
    renderPage(<OrderProfitabilityGlPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server exploded");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ORD-005")).toBeInTheDocument();
    cleanup();

    h.api.listOrderProfit.mockReset();
    h.me = { ...CT_ME, feature_flags: {} };
    renderPage(<OrderProfitabilityGlPage />);
    expect(await screen.findByText("GL profitability is switched off")).toBeInTheDocument();
    expect(h.api.listOrderProfit).not.toHaveBeenCalled();
  });
});

describe("Style / LC / Buyer P&L (GL) page", () => {
  it("loads the style named in the address and shows its budget, actual and coverage", async () => {
    h.api.getProfitability.mockResolvedValue(profit({ entity: { type: "style", id: 7, code: "ST-07", name: "Polo" } }));
    renderPage(<EntityProfitabilityGlPage />, "/app/finance/profitability/entity?kind=styles&id=7");
    await screen.findByTestId("profit-detail");
    expect(h.api.getProfitability).toHaveBeenCalledWith("styles", 7, expect.any(Object));
    expect(screen.getByText("ST-07")).toBeInTheDocument();
    expect(screen.getByTestId("detail-nett")).toHaveTextContent("570.00");
  });

  it("shows a dash for a null margin", async () => {
    h.api.getProfitability.mockResolvedValue(profit({ margin_percent: null }));
    renderPage(<EntityProfitabilityGlPage />, "/app/finance/profitability/entity?kind=buyers&id=3");
    await screen.findByTestId("profit-detail");
    expect(h.api.getProfitability).toHaveBeenCalledWith("buyers", 3, expect.any(Object));
    expect(screen.getByTestId("detail-margin")).toHaveTextContent("—");
    expect(screen.getByTestId("detail-margin").textContent).not.toContain("%");
  });

  it("asks the user to choose a record first and loads nothing", async () => {
    renderPage(<EntityProfitabilityGlPage />, "/app/finance/profitability/entity");
    expect(await screen.findByText(/Choose a style above/)).toBeInTheDocument();
    expect(h.api.getProfitability).not.toHaveBeenCalled();
  });

  it("switching the kind clears the chosen record", async () => {
    h.api.getProfitability.mockResolvedValue(profit());
    renderPage(<EntityProfitabilityGlPage />, "/app/finance/profitability/entity?kind=styles&id=7");
    await screen.findByTestId("profit-detail");
    fireEvent.change(screen.getByLabelText("Show profit of"), { target: { value: "master-contracts" } });
    expect(await screen.findByText(/Choose a master contract \/ lc above/)).toBeInTheDocument();
    expect(screen.queryByTestId("profit-detail")).toBeNull();
  });

  it("a 404 explains that the record was not found", async () => {
    h.api.getProfitability.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    renderPage(<EntityProfitabilityGlPage />, "/app/finance/profitability/entity?kind=styles&id=999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found.");
  });
});
