// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listTdsSections: vi.fn(),
    getTdsSettings: vi.fn(),
    createTdsSection: vi.fn(),
    updateTdsSection: vi.fn(),
    updateTdsSettings: vi.fn(),
    assignPartyLedgerTdsSection: vi.fn(),
  },
  coa: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: h.api }));
vi.mock("@/lib/masterData", () => ({ getChartOfAccountsCached: h.coa }));

import { TdsSettingsPage } from "./TdsSettingsPage";

beforeEach(() => {
  h.api.listTdsSections.mockResolvedValue({
    rows: [
      {
        id: 5,
        section_code: "194C",
        description: "Contractors",
        threshold_amount: "30000",
        tds_rate: "2",
        rate_company: null,
        rate_non_company: null,
        is_active: true,
      },
    ],
  });
  h.api.getTdsSettings.mockResolvedValue({ tds_payable_account_id: null });
  h.api.createTdsSection.mockResolvedValue({});
  h.coa.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TdsSettingsPage", () => {
  it("shows sections in a scroll card and creates one from the drawer", async () => {
    render(
      <MemoryRouter>
        <TdsSettingsPage />
      </MemoryRouter>,
    );
    await screen.findByText("194C");
    expect(screen.getByText("Showing 1 of 1 section")).toBeTruthy();
    expect(screen.getByText("Global settings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add TDS section" }));
    expect(screen.getByRole("dialog", { name: "New TDS section" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("194C"), { target: { value: "194J" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(h.api.createTdsSection).toHaveBeenCalled());
    expect(h.api.createTdsSection.mock.calls[0]![0].section_code).toBe("194J");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
