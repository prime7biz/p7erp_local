// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listVoucherClasses: vi.fn(),
    getVoucherTypesMeta: vi.fn(),
    createVoucherClass: vi.fn(),
    updateVoucherClass: vi.fn(),
    deleteVoucherClass: vi.fn(),
  },
  confirm: vi.fn(async () => true),
  getChartOfAccountsCached: vi.fn(),
  getCostCentersCached: vi.fn(),
}));

vi.mock("@/components/app/useConfirm", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/lib/masterData", () => ({
  getChartOfAccountsCached: (...args: unknown[]) => h.getChartOfAccountsCached(...args),
  getCostCentersCached: (...args: unknown[]) => h.getCostCentersCached(...args),
}));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { VoucherClassPage } from "./VoucherClassPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.confirm.mockResolvedValue(true);
  h.getChartOfAccountsCached.mockResolvedValue([
    { id: 10, account_number: "1001", name: "Cash", is_active: true },
  ]);
  h.getCostCentersCached.mockResolvedValue([]);
  h.api.getVoucherTypesMeta.mockResolvedValue(["JOURNAL", "PAYMENT"]);
  h.api.listVoucherClasses.mockResolvedValue({
    rows: [
      {
        id: 5,
        name: "Fuel expense",
        voucher_type: "PAYMENT",
        default_ledger_id: 10,
        default_narration: "Fuel",
        default_cost_center_id: null,
        auto_tax: false,
        auto_round_off: false,
        auto_bill_allocation: false,
        is_active: true,
        line_templates: [{ account_id: 10, entry_type: "DEBIT", amount: "100", notes: "line1" }],
      },
    ],
  });
});

afterEach(cleanup);

describe("VoucherClassPage", () => {
  it("opens Add class empty and Edit with templates loaded", async () => {
    render(
      <MemoryRouter>
        <VoucherClassPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Fuel expense")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add class" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Name/i)).toHaveProperty("value", "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const row = screen.getByText("Fuel expense").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit class" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Name/i)).toHaveProperty("value", "Fuel expense");
    expect(within(dialog).getByDisplayValue("100")).toBeTruthy();
  });
});
