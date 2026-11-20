// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listOutstandingBills: vi.fn(),
    listPaymentRuns: vi.fn(),
    listUsers: vi.fn(),
    createPaymentRun: vi.fn(),
    approvePaymentRun: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { user_id: 1 } }) }));
vi.mock("@/lib/masterData", () => ({
  getBankAccountsCached: vi.fn().mockResolvedValue([{ id: 3, bank_name: "City", account_name: "Main" }]),
}));

import { PaymentRunsPage } from "./PaymentRunsPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listOutstandingBills.mockResolvedValue([
    { id: 5, bill_no: "B-1", party_name: "Acme", amount: "100", paid_amount: "0", currency: "BDT", status: "OPEN" },
  ]);
  h.api.listPaymentRuns.mockResolvedValue([
    { id: 9, run_code: "PR-9", run_date: "2026-11-01", total_amount: "100", base_currency: "BDT", status: "DRAFT", items: [], executed_voucher_id: null },
  ]);
  h.api.listUsers.mockResolvedValue([{ id: 1, role_name: "admin" }]);
  h.api.createPaymentRun.mockResolvedValue({});
  h.api.approvePaymentRun.mockResolvedValue({});
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <PaymentRunsPage />
    </MemoryRouter>,
  );
}

describe("PaymentRunsPage", () => {
  it("keeps drawer error separate and creates a run once bills and a bank are chosen", async () => {
    renderPage();
    expect(await screen.findByText("PR-9")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create payment run" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Run (Draft)" }));
    expect(await within(dialog).findByText("Please select payable bills")).toBeTruthy();

    fireEvent.click(within(dialog).getByLabelText("Pick B-1"));
    fireEvent.change(within(dialog).getByLabelText(/Bank account/), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Run (Draft)" }));
    await waitFor(() => expect(h.api.createPaymentRun).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("approves a draft run from the Actions menu", async () => {
    renderPage();
    const row = (await screen.findByText("PR-9")).closest("tr") as HTMLElement;
    await waitFor(() => expect(h.api.listUsers).toHaveBeenCalled());
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Approve" }));
    await waitFor(() => expect(h.api.approvePaymentRun).toHaveBeenCalledWith(9));
  });
});