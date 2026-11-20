// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listAccountingPeriods: vi.fn(),
    createAccountingPeriod: vi.fn(),
    closeAccountingPeriod: vi.fn(),
    reopenAccountingPeriod: vi.fn(),
    deleteAccountingPeriod: vi.fn(),
    checkAccountingPeriodLock: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { AccountingPeriodsPage } from "./AccountingPeriodsPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listAccountingPeriods.mockResolvedValue([
    {
      id: 3,
      period_name: "Nov-2026",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      is_closed: false,
    },
    {
      id: 2,
      period_name: "Oct-2026",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      is_closed: true,
    },
  ]);
  h.api.closeAccountingPeriod.mockResolvedValue({ ok: true });
  h.api.reopenAccountingPeriod.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("AccountingPeriodsPage", () => {
  it("opens Add period with defaults and calls Close / Reopen APIs", async () => {
    render(
      <MemoryRouter>
        <AccountingPeriodsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("OPEN")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add period" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Period name/i)).toHaveProperty("value", "");
    expect((within(dialog).getByLabelText(/Start date/i) as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const openRow = screen.getByText("OPEN").closest("tr") as HTMLElement;
    fireEvent.click(within(openRow).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close" }));
    expect(h.api.closeAccountingPeriod).toHaveBeenCalledWith(3);

    const closedRow = screen.getByText("CLOSED").closest("tr") as HTMLElement;
    fireEvent.click(within(closedRow).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reopen" }));
    expect(h.api.reopenAccountingPeriod).toHaveBeenCalledWith(2);
  });
});
