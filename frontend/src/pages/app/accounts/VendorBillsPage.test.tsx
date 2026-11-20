// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VendorBillsPage } from "./VendorBillsPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listVendorBills: vi.fn(async () => [
      { id: 7, bill_code: "VB-7", vendor_id: 3, status: "DRAFT", goods_receiving_id: null, total_amount: "50" },
    ]),
    getVendorBill: vi.fn(async () => ({
      id: 7, bill_code: "VB-7", vendor_id: 3, status: "DRAFT", vendor_invoice_ref: "", lines: [],
      is_non_po_receipt: false, purchase_order_id: null, source_order_id: null, goods_receiving_id: null,
    })),
    patchVendorBill: vi.fn(),
    postVendorBill: vi.fn(),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));
vi.mock("@/pages/app/finance/party-ledger/PartyLedgerSummaryCard", () => ({ PartyLedgerSummaryCard: () => <div /> }));

describe("VendorBillsPage", () => {
  it("opens the detail drawer from the View action and requires an invoice ref to post", async () => {
    render(
      <MemoryRouter>
        <VendorBillsPage />
      </MemoryRouter>,
    );
    await screen.findByText("VB-7");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Post AP" }));
    await screen.findByText("Enter vendor invoice reference before posting.");
    expect(h.api.postVendorBill).not.toHaveBeenCalled();
  });
});
