// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listTaxLedgers: vi.fn(),
    createTaxLedger: vi.fn(),
    deactivateTaxLedger: vi.fn(),
  },
  coa: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: h.api }));
vi.mock("@/lib/masterData", () => ({ getChartOfAccountsCached: h.coa }));

import { TaxLedgersPage } from "./TaxLedgersPage";

beforeEach(() => {
  h.api.listTaxLedgers.mockResolvedValue([
    {
      id: 1,
      chart_account_id: 10,
      tax_type: "CGST",
      tax_rate: "9",
      gst_type: "GOODS",
      nature_of_transaction: null,
      is_active: true,
    },
  ]);
  h.api.createTaxLedger.mockResolvedValue({});
  h.coa.mockResolvedValue([{ id: 10, account_number: "2100", name: "CGST Payable" }]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaxLedgersPage", () => {
  it("lists ledgers in a scroll card and creates through the drawer", async () => {
    render(
      <MemoryRouter>
        <TaxLedgersPage />
      </MemoryRouter>,
    );
    await screen.findByText("Showing 1 of 1 tax ledger");
    expect(screen.queryByRole("dialog")).toBeNull();

    const user = userEvent.setup();
    fireEvent.click(screen.getByRole("button", { name: "Add tax ledger" }));
    expect(screen.getByRole("dialog", { name: "Add tax ledger" })).toBeTruthy();

    const accountInput = screen.getByRole("combobox", { name: "Tax ledger account" });
    await user.click(accountInput);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: /CGST Payable/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(h.api.createTaxLedger).toHaveBeenCalledWith({
        chart_account_id: 10,
        tax_type: "CGST",
        tax_rate: "9",
        gst_type: "GOODS",
        nature_of_transaction: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
