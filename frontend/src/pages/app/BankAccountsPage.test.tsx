// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listBankAccounts: vi.fn(),
    listChartOfAccounts: vi.fn(),
    createBankAccount: vi.fn(),
    updateBankAccount: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { BankAccountsPage } from "./BankAccountsPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listBankAccounts.mockResolvedValue([
    { id: 1, account_name: "Main", bank_name: "City Bank", account_number: "123", currency: "BDT", current_balance: "100", opening_balance: "0", is_active: true },
  ]);
  h.api.listChartOfAccounts.mockResolvedValue([]);
  h.api.createBankAccount.mockResolvedValue({});
});

afterEach(cleanup);

describe("BankAccountsPage", () => {
  it("shows validation inside the drawer and creates an account", async () => {
    render(<BankAccountsPage />);
    expect(await screen.findByText("City Bank")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add bank account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText("Account name is required")).toBeTruthy();
    expect(h.api.createBankAccount).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Account name/), { target: { value: "Pay" } });
    fireEvent.change(within(dialog).getByLabelText(/Bank name/), { target: { value: "ABC" } });
    fireEvent.change(within(dialog).getByLabelText(/Account number/), { target: { value: "999" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(h.api.createBankAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens Edit from the Actions menu", async () => {
    render(<BankAccountsPage />);
    const row = (await screen.findByText("City Bank")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Account name/)).toHaveProperty("value", "Main");
  });
});