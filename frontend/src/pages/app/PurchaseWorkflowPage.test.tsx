// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PurchaseWorkflowPage } from "./PurchaseWorkflowPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    getPurchaseApOverview: vi.fn(async () => ({})),
    listOutstandingBills: vi.fn(async () => []),
    listPurchaseOrders: vi.fn(async () => [
      { id: 5, po_code: "PO-5", supplier_name: "Sup", status: "APPROVED", currency: "BDT" },
    ]),
    listGoodsReceiving: vi.fn(async () => []),
    createPayableFromPurchaseOrder: vi.fn(async () => ({})),
    createPayableFromGoodsReceiving: vi.fn(async () => ({})),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

describe("PurchaseWorkflowPage", () => {
  it("creates an AP bill from the PO Actions menu", async () => {
    render(
      <MemoryRouter>
        <PurchaseWorkflowPage />
      </MemoryRouter>,
    );
    await screen.findByText("PO-5");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Create AP bill" }));
    await waitFor(() => expect(h.api.createPayableFromPurchaseOrder).toHaveBeenCalledWith(5, { due_in_days: 30, currency: "BDT" }));
  });
});
