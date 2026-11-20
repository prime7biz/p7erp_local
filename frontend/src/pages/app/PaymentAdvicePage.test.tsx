// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ api: { getPaymentRunAdvice: vi.fn() } }));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { PaymentAdvicePage } from "./PaymentAdvicePage";

beforeEach(() => {
  h.api.getPaymentRunAdvice.mockReset();
  h.api.getPaymentRunAdvice.mockResolvedValue({
    header: { run_code: "PR-1", run_date: "2026-11-01", bank_name: "City", executed_voucher_id: 12 },
    items: [{ item_id: 1, party_name: "Acme", reference: "B-1", amount: 100, status: "PAID" }],
    totals: { total_amount: 100, item_count: 1 },
  });
});

afterEach(cleanup);

describe("PaymentAdvicePage", () => {
  it("uses a filter toolbar (no drawer) and loads the advice", async () => {
    render(
      <MemoryRouter initialEntries={["/x?run_id=1"]}>
        <PaymentAdvicePage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Payment run ID"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Load Advice" }));
    expect(await screen.findByText("Enter valid run ID")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Payment run ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load Advice" }));
    await waitFor(() => expect(h.api.getPaymentRunAdvice).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Acme")).toBeTruthy();
    expect(screen.getByText("Total: 100 (1 items)")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});