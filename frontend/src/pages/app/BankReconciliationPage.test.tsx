// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listBankAccounts: vi.fn(),
    listBankReconciliations: vi.fn(),
    listPaymentRuns: vi.fn(),
    listBankStatementLines: vi.fn(),
    getBankReconciliationSummary: vi.fn(),
    listBankStatementMatchLogs: vi.fn(),
    listUsers: vi.fn(),
    createBankReconciliation: vi.fn(),
    importBankStatementLines: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { user_id: 1 } }) }));

import { BankReconciliationPage } from "./BankReconciliationPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listBankAccounts.mockResolvedValue([{ id: 7, bank_name: "City", account_name: "Main" }]);
  h.api.listBankReconciliations.mockResolvedValue([
    { id: 11, statement_date: "2026-11-01", statement_balance: "100", book_balance: "90", difference_amount: "10", status: "OPEN", is_finalized: false },
  ]);
  h.api.listPaymentRuns.mockResolvedValue([]);
  h.api.listBankStatementLines.mockResolvedValue([]);
  h.api.getBankReconciliationSummary.mockResolvedValue({ line_count: 0, matched_count: 0, unmatched_count: 0, difference_amount: 10 });
  h.api.listBankStatementMatchLogs.mockResolvedValue([]);
  h.api.listUsers.mockResolvedValue([]);
  h.api.createBankReconciliation.mockResolvedValue({});
  h.api.importBankStatementLines.mockResolvedValue([]);
});

afterEach(cleanup);

describe("BankReconciliationPage", () => {
  it("creates a statement from the drawer while the add-line form stays inline", async () => {
    render(<BankReconciliationPage />);
    expect(await screen.findByText("2026-11-01")).toBeTruthy();
    // inline add-line form is on the page, not in a drawer
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Add Line" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Statement balance"), { target: { value: "250" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Statement" }));
    await waitFor(() => expect(h.api.createBankReconciliation).toHaveBeenCalledTimes(1));
    expect(h.api.createBankReconciliation.mock.calls[0]?.[0]).toMatchObject({ bank_account_id: 7, statement_balance: "250" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers Resolve in the row Actions menu", async () => {
    render(<BankReconciliationPage />);
    const row = (await screen.findByText("2026-11-01")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "Resolve" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Selected" })).toBeTruthy();
  });
});