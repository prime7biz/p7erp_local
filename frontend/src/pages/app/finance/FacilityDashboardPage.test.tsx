// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: { getFacilitySummary: vi.fn(), getFacilityUpcomingObligations: vi.fn() },
}));

vi.mock("@/api/client", () => ({ api: h.api }));

import { FacilityDashboardPage } from "./FacilityDashboardPage";

beforeEach(() => {
  h.api.getFacilitySummary.mockResolvedValue({
    facilities_count: 3,
    active_debt_principal: "1000",
    schedule_emi_outstanding_all_lines: "250",
  });
  h.api.getFacilityUpcomingObligations.mockResolvedValue({ months: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FacilityDashboardPage", () => {
  it("renders header, summary strip and obligations section", async () => {
    render(
      <MemoryRouter>
        <FacilityDashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Facilities dashboard" })).toBeTruthy();
    expect(await screen.findByText("3")).toBeTruthy();
    expect(screen.getByText("Active debt (principal)")).toBeTruthy();
    expect(screen.getByText("Upcoming obligations by month")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All facilities/ })).toBeTruthy();
  });
});
