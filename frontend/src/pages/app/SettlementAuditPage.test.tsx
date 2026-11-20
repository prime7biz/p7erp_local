// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listSettlementAudit: vi.fn(),
    listSettlementAuditPresets: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { SettlementAuditPage } from "./SettlementAuditPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listSettlementAudit.mockResolvedValue({
    rows: [
      { item_id: 1, run_code: "PR-1", run_date: "2026-11-01", run_status: "EXECUTED", party_name: "Acme", bill_no: "B-1", source_currency: "USD", source_amount: 10, fx_rate_to_base: 120, base_amount: 1200, base_currency: "BDT" },
    ],
    totals: { row_count: 1, source_total: 10, base_total: 1200 },
  });
  h.api.listSettlementAuditPresets.mockResolvedValue([]);
});

afterEach(cleanup);

describe("SettlementAuditPage", () => {
  it("shows results in a scroll table and re-queries with the party filter (no drawer)", async () => {
    render(<SettlementAuditPage />);
    expect(await screen.findByText("PR-1")).toBeTruthy();
    expect(screen.getByText("Showing 1 of 1 record")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search party"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    await waitFor(() =>
      expect(h.api.listSettlementAudit).toHaveBeenLastCalledWith(expect.objectContaining({ party_query: "acme", limit: 500 })),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});