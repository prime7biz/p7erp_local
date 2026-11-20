// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OutstandingBillsPage } from "./OutstandingBillsPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listOutstandingBills: vi.fn(async () => [
      { id: 1, bill_no: "B-1", party_name: "Acme", due_date: "2026-12-01", amount: "100", paid_amount: "0", status: "OPEN" },
    ]),
    getBillsAging: vi.fn(async () => ({ buckets: { current: 1, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 } })),
    createOutstandingBill: vi.fn(),
    settleOutstandingBill: vi.fn(async () => ({})),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

function renderPage() {
  render(
    <MemoryRouter>
      <OutstandingBillsPage />
    </MemoryRouter>,
  );
}

describe("OutstandingBillsPage", () => {
  it("opens the Add bill drawer", async () => {
    renderPage();
    await screen.findByText("B-1");
    fireEvent.click(screen.getByRole("button", { name: "Add bill" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Bill" })).toBeTruthy();
  });

  it("settles a bill from the Actions menu with the same API", async () => {
    renderPage();
    await screen.findByText("B-1");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settle" }));
    fireEvent.change(screen.getByLabelText("Settle amount"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    await waitFor(() => expect(h.api.settleOutstandingBill).toHaveBeenCalledWith(1, "40"));
  });
});
