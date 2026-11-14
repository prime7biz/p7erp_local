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

  it("shows the step-by-step calculation with every slab, including slabs not reached", () => {
    const detailed: HrTdsEstimate = {
      ...base,
      monthly_tds: "3750.00",
      annual_gross: "1200000.00",
      exempt_income: "400000.00",
      taxable_income: "800000.00",
      threshold: "400000",
      category_label: "General taxpayer",
      slab_tax: "45000.00",
      investment_rebate: "0",
      minimum_tax: "5000",
      minimum_tax_applied: false,
      net_annual_tax: "45000.00",
      slab_schedule: [
        { from: "0.00", to: "400000.00", rate: "0", taxed_amount: "400000.00", tax: "0.00", tax_free: true },
        { from: "400000.00", to: "700000.00", rate: "0.10", taxed_amount: "300000.00", tax: "30000.00", tax_free: false },
        { from: "700000.00", to: "1100000.00", rate: "0.15", taxed_amount: "100000.00", tax: "15000.00", tax_free: false },
        { from: "1100000.00", to: null, rate: "0.30", taxed_amount: "0.00", tax: "0.00", tax_free: false },
      ],
    };
    render(<TdsEstimateBox estimate={detailed} />);
    expect(screen.getByTestId("tds-details")).toBeTruthy();
    expect(screen.getByText("Taxable income")).toBeTruthy();
    expect(screen.getByText(/General taxpayer/)).toBeTruthy();
    const slabs = screen.getByRole("table", { name: "Tax slabs" });
    expect(slabs.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(screen.getByText("10%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText(/Above 11,00,000.00/)).toBeTruthy();
    expect(screen.getByText("Monthly TDS (yearly tax / 12)")).toBeTruthy();
    expect(screen.queryByText(/investment rebate/)).toBeNull();
  });
});

