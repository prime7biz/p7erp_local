// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { role_name: "employee", feature_flags: {} } }) }));
vi.mock("@/lib/fileSave", () => ({ saveBlob: vi.fn().mockResolvedValue("downloaded") }));

const api = vi.hoisted(() => ({
  listHrEssMyAttendance: vi.fn(),
  listHrEssMyLeaveRequests: vi.fn(),
  listHrEssMyPayslips: vi.fn(),
  listHrLeaveTypes: vi.fn().mockResolvedValue([]),
  createHrEssMyLeaveRequest: vi.fn(),
  submitHrLeaveRequest: vi.fn(),
  downloadHrPayslipPdf: vi.fn(),
  lookupHrEmployees: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/api/client", () => ({ api, getTenantId: () => "1" }));

import { HrMyAttendancePage } from "./HrMyAttendancePage";
import { HrMyLeavePage } from "./HrMyLeavePage";
import { HrMyPayslipsPage } from "./HrMyPayslipsPage";

const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("My HR pages read the self-service API shapes", () => {
  it("My Attendance shows the monthly summary", async () => {
    api.listHrEssMyAttendance.mockResolvedValue([
      { year: 2026, month: 11, present_days: 20, absent_days: 1, late_days: 2, overtime_hours: 6.5 },
      { year: 2026, month: 10, present_days: 22, absent_days: 0, late_days: 0, overtime_hours: 125 / 60 },
    ]);
    wrap(<HrMyAttendancePage />);
    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[1]!;
    expect(row.textContent).toContain("2026-11");
    expect(row.textContent).toContain("20");
    expect(row.textContent).toContain("6.5");
    expect(table.textContent).toContain("2.08");
    expect(table.textContent).not.toContain("2.0833");
  });

  it("My Leave turns the leave type id sent by the API into its name, and submits drafts", async () => {
    const user = userEvent.setup();
    api.listHrLeaveTypes.mockResolvedValue([
      { id: 3, code: "CL", name: "Casual leave", is_paid: true, requires_approval: true, is_active: true },
      { id: 4, code: "OLD", name: "Old leave", is_paid: true, requires_approval: true, is_active: false },
    ]);
    api.submitHrLeaveRequest.mockResolvedValue({});
    api.listHrEssMyLeaveRequests.mockResolvedValue([
      { id: 1, leave_type: "3", start_date: "2026-11-12", end_date: "2026-11-13", days_count: 2, reason: "Family", status: "DRAFT", approved_at: null, created_at: "2026-11-10" },
      { id: 2, leave_type: "4", start_date: "2026-10-01", end_date: "2026-10-01", days_count: 1, reason: null, status: "APPROVED", approved_at: null, created_at: "2026-09-20" },
    ]);
    wrap(<HrMyLeavePage />);
    const table = await screen.findByRole("table");
    await within(table).findByText("Casual leave");
    const rows = within(table).getAllByRole("row");
    const draft = rows.find((r) => r.textContent?.includes("2026-11-12"))!;
    const approved = rows.find((r) => r.textContent?.includes("2026-10-01"))!;
    expect(approved.textContent).toContain("Old leave");
    expect(within(approved).queryByRole("button", { name: /submit|জমা/i })).toBeNull();
    await user.click(within(draft).getByRole("button", { name: /submit|জমা/i }));
    expect(api.submitHrLeaveRequest).toHaveBeenCalledWith(1);
  });

  it("My Payslips shows the month and amounts and downloads the PDF", async () => {
    const user = userEvent.setup();
    api.listHrEssMyPayslips.mockResolvedValue([
      { id: 77, period_year: 2026, period_month: 10, gross_pay: "15000.0000", deductions: "500.0000", net_pay: "14500.0000", currency: "BDT", status: "generated", issued_at: null, download_url: null },
    ]);
    api.downloadHrPayslipPdf.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
    wrap(<HrMyPayslipsPage />);
    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[1]!;
    expect(row.textContent).toContain("2026-10");
    expect(row.textContent).toContain("14,500.00");
    await user.click(within(row).getByRole("button", { name: /download pdf|PDF/i }));
    expect(api.downloadHrPayslipPdf).toHaveBeenCalledWith(77);
  });
});
