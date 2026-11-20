// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("shows NO_DATA and blocked reason", () => {
    render(
      <KpiCard
        card={{
          definition: {
            id: 1,
            code: "QA-02",
            name: "DHU",
            module: "production",
            metric_type: "KPI",
            tier: "CORE",
            unit: "DHU",
            direction: "DOWN",
            sensitivity: "OPERATIONAL",
            applicability: ["F"],
            dashboard_codes: ["executive"],
            blocked_reason: "QA_04_UNSTRUCTURED_QC",
            definition_version: 1,
            active: true,
          },
          value: {
            code: "QA-02",
            value: null,
            unit: "DHU",
            as_of: "2026-11-19T00:00:00Z",
            formula_version: "blocked",
            status: "NO_DATA",
            missing_inputs: ["QA_04_UNSTRUCTURED_QC"],
          },
        }}
        onDrill={vi.fn()}
      />,
    );
    expect(screen.getByText("DHU")).toBeTruthy();
    expect(screen.getAllByText(/QA_04_UNSTRUCTURED_QC/).length).toBeGreaterThan(0);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
