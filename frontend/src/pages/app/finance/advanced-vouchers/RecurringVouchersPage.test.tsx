// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecurringVouchersPage } from "./RecurringVouchersPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listRecurringVouchers: vi.fn(async () => ({
      rows: [{ id: 2, name: "Rent", voucher_type: "JOURNAL", frequency: "MONTHLY", next_due_date: "2026-12-01", is_active: true }],
    })),
    getVoucherTypesMeta: vi.fn(async () => ["JOURNAL"]),
    createRecurringVoucher: vi.fn(),
    deleteRecurringVoucher: vi.fn(),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

describe("RecurringVouchersPage", () => {
  it("opens the New template drawer", async () => {
    render(
      <MemoryRouter>
        <RecurringVouchersPage />
      </MemoryRouter>,
    );
    await screen.findByText("Rent");
    fireEvent.click(screen.getByRole("button", { name: "New template" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create template" })).toBeTruthy();
  });

  it("keeps the existing row menu items", async () => {
    render(
      <MemoryRouter>
        <RecurringVouchersPage />
      </MemoryRouter>,
    );
    await screen.findByText("Rent");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    for (const name of ["Disable", "Generate now", "View history", "Delete"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy();
    }
  });
});
