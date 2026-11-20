// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountGroupResponse } from "@/api/client";

const h = vi.hoisted(() => ({
  api: {
    listAccountGroups: vi.fn(),
    listAccountGroupsHierarchy: vi.fn(),
    createAccountGroup: vi.fn(),
    updateAccountGroup: vi.fn(),
    deleteAccountGroup: vi.fn(),
    seedAccountGroups: vi.fn(),
    getAccountGroupReportingImpact: vi.fn(),
  },
  confirm: vi.fn(async () => true),
}));

vi.mock("@/components/app/useConfirm", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/hooks/useFinanceStatements", () => ({ useStatementsEnabled: () => false }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { AccountGroupsPage } from "./AccountGroupsPage";

const GROUPS: AccountGroupResponse[] = [
  {
    id: 1,
    tenant_id: 1,
    code: "CA",
    name: "Current Assets",
    nature: "Asset",
    parent_group_id: null,
    is_active: true,
  },
  {
    id: 2,
    tenant_id: 1,
    code: "IE",
    name: "Indirect Expenses",
    nature: "Expense",
    parent_group_id: null,
    is_active: true,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountGroupsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.confirm.mockResolvedValue(true);
  h.api.listAccountGroups.mockResolvedValue(GROUPS);
  h.api.listAccountGroupsHierarchy.mockResolvedValue([]);
});

afterEach(cleanup);

describe("AccountGroupsPage", () => {
  it("filters the list by search and nature", async () => {
    renderPage();
    expect(await screen.findByText("Current Assets")).toBeTruthy();
    expect(screen.getByText("Indirect Expenses")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search groups"), { target: { value: "indirect" } });
    await waitFor(() => {
      expect(screen.queryByText("Current Assets")).toBeNull();
      expect(screen.getByText("Indirect Expenses")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Search groups"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by nature"), { target: { value: "Asset" } });
    await waitFor(() => {
      expect(screen.getByText("Current Assets")).toBeTruthy();
      expect(screen.queryByText("Indirect Expenses")).toBeNull();
    });
  });

  it("opens Add group and Edit drawers", async () => {
    renderPage();
    expect(await screen.findByText("Current Assets")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add group" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Name/i)).toHaveProperty("value", "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const row = screen.getByText("Current Assets").closest("tr");
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit account group" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Name/i)).toHaveProperty("value", "Current Assets");
  });
});
