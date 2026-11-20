// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listCurrencyExchangeRates: vi.fn(),
    getMultiCurrencyRevaluationSummary: vi.fn(),
    createCurrencyExchangeRate: vi.fn(),
    updateCurrencyExchangeRate: vi.fn(),
    deleteCurrencyExchangeRate: vi.fn(),
  },
  confirm: vi.fn(async () => true),
}));

vi.mock("@/components/app/useConfirm", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { AccountsCurrencyPage } from "./AccountsCurrencyPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.confirm.mockResolvedValue(true);
  h.api.listCurrencyExchangeRates.mockResolvedValue([
    {
      id: 9,
      from_currency: "USD",
      to_currency: "BDT",
      exchange_rate: "120.5",
      effective_date: "2026-11-01",
      source: "manual",
      is_active: true,
    },
  ]);
  h.api.getMultiCurrencyRevaluationSummary.mockResolvedValue({
    total_old_base_amount: 0,
    total_new_base_amount: 0,
    total_gain_loss: 0,
    rows: [],
  });
});

afterEach(cleanup);

describe("AccountsCurrencyPage", () => {
  it("opens Add rate with defaults and Edit with read-only currencies", async () => {
    render(
      <MemoryRouter>
        <AccountsCurrencyPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("USD/BDT")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add exchange rate" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/From currency/i)).toHaveProperty("value", "USD");
    expect(within(dialog).getByLabelText(/To currency/i)).toHaveProperty("value", "BDT");
    expect(within(dialog).getByLabelText(/Exchange rate/i)).toHaveProperty("value", "120");
    expect((within(dialog).getByLabelText(/From currency/i) as HTMLInputElement).readOnly).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const row = screen.getByText("USD/BDT").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit exchange rate" })).toBeTruthy();
    expect((within(dialog).getByLabelText(/From currency/i) as HTMLInputElement).readOnly).toBe(true);
    expect((within(dialog).getByLabelText(/To currency/i) as HTMLInputElement).readOnly).toBe(true);
    expect(within(dialog).getByLabelText(/Exchange rate/i)).toHaveProperty("value", "120.5");
  });
});
