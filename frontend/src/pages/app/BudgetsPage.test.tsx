// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listBudgets: vi.fn(),
    getBudgetVsActual: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
  },
  confirm: vi.fn(),
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: {} } }) }));
vi.mock("@/components/app/useConfirm", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/lib/masterData", () => ({
  getChartOfAccountsCached: vi.fn().mockResolvedValue([]),
  getCostCentersCached: vi.fn().mockResolvedValue([]),
}));

import { BudgetsPage } from "./BudgetsPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.confirm.mockReset();
  h.api.listBudgets.mockResolvedValue([
    { id: 1, budget_name: "FY Plan", fiscal_year: "2026-2027", status: "DRAFT", lines: [] },
  ]);
  h.api.createBudget.mockResolvedValue({});
  h.api.deleteBudget.mockResolvedValue({});
  h.confirm.mockResolvedValue(true);
});

afterEach(cleanup);

describe("BudgetsPage", () => {
  it("creates a budget through the drawer", async () => {
    render(<BudgetsPage />);
    expect(await screen.findByText("FY Plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New budget" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Budget name"), { target: { value: "Q1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Budget" }));
    await waitFor(() => expect(h.api.createBudget).toHaveBeenCalledTimes(1));
    expect(h.api.createBudget.mock.calls[0]?.[0]).toMatchObject({ budget_name: "Q1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Actions menu has Edit and a Delete that confirms first", async () => {
    render(<BudgetsPage />);
    const row = (await screen.findByText("FY Plan")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(h.api.deleteBudget).toHaveBeenCalledWith(1));
    expect(h.confirm).toHaveBeenCalled();
  });
});