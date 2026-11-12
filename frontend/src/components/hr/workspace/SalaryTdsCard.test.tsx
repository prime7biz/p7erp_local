// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HrTdsEstimate } from "@/api/client";
import { TdsEstimateBox } from "./SalaryTdsCard";

const base: HrTdsEstimate = {
  estimate_basis: "SALARY_ONLY",
  payroll_enabled: true,
  employee_tds_enabled: true,
  supported: true,
  message: null,
  monthly_tds: "1250.5",
  estimated_net_monthly: "48749.5",
  warnings: ["Gender missing: General threshold used."],
};

describe("TdsEstimateBox", () => {
  it("shows the monthly tax, net pay and warnings", () => {
    render(<TdsEstimateBox estimate={base} />);
    expect(screen.getByText(/Salary-only estimate/)).toBeTruthy();
    expect(screen.getByText(/General threshold used/)).toBeTruthy();
  });

  it("says when tax is off for the employee", () => {
    render(<TdsEstimateBox estimate={{ ...base, employee_tds_enabled: false }} />);
    expect(screen.getByText(/switched off for this employee/)).toBeTruthy();
  });

  it("shows the message for an unsupported tax year", () => {
    render(<TdsEstimateBox estimate={{ ...base, supported: false, message: "No rates for this year" }} />);
    expect(screen.getByText("No rates for this year")).toBeTruthy();
  });

  it("renders nothing without an estimate", () => {
    const { container } = render(<TdsEstimateBox estimate={null} />);
    expect(container.innerHTML).toBe("");
  });
});

