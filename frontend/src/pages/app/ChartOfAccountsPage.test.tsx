// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountGroupResponse, ChartOfAccountResponse } from "@/api/client";

const h = vi.hoisted(() => ({
  me: {
    feature_flags: { coa_ledger_interest_v1: false },
  } as Record<string, unknown>,
  api: {
    listAccountGroups: vi.fn(),
    listChartOfAccounts: vi.fn(),
    createChartOfAccount: vi.fn(),
    updateChartOfAccount: vi.fn(),
    deleteChartOfAccount: vi.fn(),
    getCoaConfig: vi.fn(),
    putCoaConfig: vi.fn(),
    coaExport: vi.fn(),
    coaImport: vi.fn(),
    previewCoaInterest: vi.fn(),
    runCoaInterest: vi.fn(),
  },
  confirm: vi.fn(async () => true),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/components/app/useConfirm", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    api: h.api,
  };
});
vi.mock("@/lib/reportExport", () => ({ downloadCsv: vi.fn() }));

import { ChartOfAccountsPage } from "./ChartOfAccountsPage";

const GROUPS: AccountGroupResponse[] = [
  {
    id: 10,
    tenant_id: 1,
    code: "CASH",
    name: "Cash-in-Hand",
    nature: "asset",
  },
  {
    id: 20,
    tenant_id: 1,
    code: "EXP",
    name: "Indirect Expenses",
    nature: "expense",
  },
];

const ACCOUNTS: ChartOfAccountResponse[] = [
  {
    id: 1,
    tenant_id: 1,
    account_number: "1001",
    name: "Petty Cash",
    group_id: 10,
    normal_balance: "debit",
    opening_balance: "500.0000",
    balance: "500.0000",
    is_active: true,
    is_bank_account: false,
    account_type: "posting",
    enable_bill_wise: false,
    version: 1,
  },
  {
    id: 2,
    tenant_id: 1,
    account_number: "5101",
    name: "Generator Fuel",
    group_id: 20,
    normal_balance: "debit",
    opening_balance: "0.0000",
    balance: "1200.0000",
    is_active: true,
    is_bank_account: false,
    account_type: "posting",
    enable_bill_wise: false,
    version: 1,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ChartOfAccountsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.me = { feature_flags: { coa_ledger_interest_v1: false } };
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.confirm.mockReset();
  h.confirm.mockResolvedValue(true);
  h.api.listAccountGroups.mockResolvedValue(GROUPS);
  h.api.listChartOfAccounts.mockResolvedValue(ACCOUNTS);
});

afterEach(cleanup);

describe("ChartOfAccountsPage", () => {
  it("filters the ledger table by search text", async () => {
    renderPage();
    expect(await screen.findByText("Petty Cash")).toBeTruthy();
    expect(screen.getByText("Generator Fuel")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search ledgers"), { target: { value: "generator" } });

    await waitFor(() => {
      expect(screen.queryByText("Petty Cash")).toBeNull();
      expect(screen.getByText("Generator Fuel")).toBeTruthy();
    });
    expect(screen.getByText("Showing 1 of 2 accounts")).toBeTruthy();
  });

  it("filters the ledger table by account group", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Petty Cash")).toBeTruthy();

    const groupFilter = screen.getByRole("combobox", { name: "Filter by group" });
    await user.click(groupFilter);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Cash-in-Hand" }));

    await waitFor(() => {
      expect(screen.getByText("Petty Cash")).toBeTruthy();
      expect(screen.queryByText("Generator Fuel")).toBeNull();
    });
  });

  it("opens an empty Add ledger drawer", async () => {
    renderPage();
    expect(await screen.findByText("Petty Cash")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add ledger" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add ledger" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Ledger name/i)).toHaveProperty("value", "");
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("opens Edit with the selected ledger name", async () => {
    renderPage();
    expect(await screen.findByText("Generator Fuel")).toBeTruthy();

    const fuelRow = screen.getByText("Generator Fuel").closest("tr");
    expect(fuelRow).toBeTruthy();
    fireEvent.click(within(fuelRow as HTMLElement).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit ledger" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Ledger name/i)).toHaveProperty("value", "Generator Fuel");
    expect(within(dialog).getByRole("button", { name: "Update" })).toBeTruthy();
  });
});
