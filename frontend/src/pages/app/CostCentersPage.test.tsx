// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listCostCenters: vi.fn(),
    getCostCenterDashboard: vi.fn(),
    createCostCenter: vi.fn(),
    updateCostCenter: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { CostCentersPage } from "./CostCentersPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listCostCenters.mockResolvedValue([
    { id: 1, center_code: "PROD", name: "Production", department: "Ops", is_active: true },
    { id: 2, center_code: "ADMIN", name: "Administration", department: "HQ", is_active: true },
  ]);
  h.api.getCostCenterDashboard.mockResolvedValue([
    { cost_center_id: 1, center_code: "PROD", name: "Production", debit_total: 100, credit_total: 40, net: 60 },
  ]);
});

afterEach(cleanup);

describe("CostCentersPage", () => {
  it("filters by search and opens Add / Edit drawers; Actions has Edit and View dashboard only", async () => {
    render(
      <MemoryRouter>
        <CostCentersPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Administration")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search cost centres"), { target: { value: "admin" } });
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 2 cost centres")).toBeTruthy();
      expect(screen.getByText("Administration")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Search cost centres"), { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 2 cost centres")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add cost centre" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add cost centre" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const listTables = screen.getAllByRole("table");
    const masterTable = listTables[0] as HTMLElement;
    const row = within(masterTable).getByText("PROD").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "View dashboard" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit cost centre" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Name/i)).toHaveProperty("value", "Production");
  });
});
