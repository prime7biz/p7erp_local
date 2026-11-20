// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listCashForecastScenarios: vi.fn(),
    getCashForecastSummary: vi.fn(),
    createCashForecastScenario: vi.fn(),
    generateCashForecastScenario: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { CashForecastPage } from "./CashForecastPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listCashForecastScenarios.mockResolvedValue([
    { id: 2, name: "Base", start_date: "2026-11-01", months: 6, status: "DRAFT", lines: [] },
  ]);
  h.api.getCashForecastSummary.mockResolvedValue({ expected_inflows: 10, expected_outflows: 4, net_cash_flow: 6, scenarios_count: 1 });
  h.api.createCashForecastScenario.mockResolvedValue({});
  h.api.generateCashForecastScenario.mockResolvedValue({});
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <CashForecastPage />
    </MemoryRouter>,
  );
}

describe("CashForecastPage", () => {
  it("creates a scenario from the drawer", async () => {
    renderPage();
    expect(await screen.findByText("Base")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create scenario" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Scenario name"), { target: { value: "Stress" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Scenario" }));
    await waitFor(() => expect(h.api.createCashForecastScenario).toHaveBeenCalledTimes(1));
    expect(h.api.createCashForecastScenario.mock.calls[0]?.[0]).toMatchObject({ name: "Stress" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("runs Generate from the Actions menu", async () => {
    renderPage();
    await screen.findByText("Base");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Generate" }));
    await waitFor(() => expect(h.api.generateCashForecastScenario).toHaveBeenCalledWith(2));
  });
});