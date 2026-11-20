// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listFxReceipts: vi.fn(),
    getFxUnsettledSummary: vi.fn(),
    createFxReceipt: vi.fn(),
    settleFxReceipt: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { FxReceiptsPage } from "./FxReceiptsPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listFxReceipts.mockResolvedValue([
    { id: 4, receipt_no: "FX-4", receipt_date: "2026-11-01", fc_amount: "10", currency: "USD", base_amount: "1200", settled_amount: "0", status: "OPEN" },
  ]);
  h.api.getFxUnsettledSummary.mockResolvedValue({ total_base_amount: 1200, total_settled_amount: 0, total_unsettled_amount: 1200 });
  h.api.createFxReceipt.mockResolvedValue({});
  h.api.settleFxReceipt.mockResolvedValue({});
});

afterEach(cleanup);

describe("FxReceiptsPage", () => {
  it("creates a receipt through the drawer", async () => {
    render(<FxReceiptsPage />);
    expect(await screen.findByText("FX-4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create receipt" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("FC Amount"), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Receipt" }));
    await waitFor(() => expect(h.api.createFxReceipt).toHaveBeenCalledTimes(1));
    expect(h.api.createFxReceipt.mock.calls[0]?.[0]).toMatchObject({ fc_amount: "50" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("settles a receipt inline", async () => {
    render(<FxReceiptsPage />);
    await screen.findByText("FX-4");
    fireEvent.change(screen.getByLabelText("Settle amount for FX-4"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    await waitFor(() => expect(h.api.settleFxReceipt).toHaveBeenCalledWith(4, "5"));
  });
});