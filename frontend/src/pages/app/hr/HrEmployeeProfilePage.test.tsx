// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { HrEmployeeOverview, HrEmployeeResponse } from "@/api/models";
import { buildTimeline, show, trimDecimal } from "./employeeProfileLogic";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags, username: "hr1" } }) }));
vi.mock("@/components/shell/recordBreadcrumb", () => ({ useRecordBreadcrumb: () => undefined }));
const photoBlob = vi.hoisted(() => vi.fn());
vi.mock("@/api/hrBangladesh", () => ({ hrBangladeshApi: { employeePhotoBlob: photoBlob } }));

const api = vi.hoisted(() => ({
  getHrEmployee: vi.fn(),
  getHrEmployeeOverview: vi.fn(),
  getHrEmployeeAccess: vi.fn(),
  listHrDepartments: vi.fn(),
  listHrDesignations: vi.fn(),
  listHrSections: vi.fn(),
  updateHrEmployee: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { HrEmployeeProfilePage } from "./HrEmployeeProfilePage";

const EMPLOYEE = {
  id: 7, tenant_id: 1, employee_code: "EMP-0007", first_name: "Rahima", last_name: "Akter", email: null, phone: "01712345678",
  reporting_manager_id: null, user_id: null, department_id: null, designation_id: null, section_id: 3,
  employee_category: "WORKER", joining_date: "2024-01-01", date_of_birth: null, gender: "Female", marital_status: null,
  blood_group: null, emergency_contact_name: null, emergency_contact_phone: null, address_line: null, city: null,
  country: null, national_id: null, employment_type: "permanent", confirmation_date: null, exit_date: null, is_active: true,
  has_photo: false, masked_fields: ["national_id", "bank_account_number"],
} as unknown as HrEmployeeResponse;

const OVERVIEW: HrEmployeeOverview = {
  employee_id: 7,
  as_of: "2026-11-14",
  recent_limit: 20,
  leave: {
    allowed: true,
    year: 2026,
    balances: [{ leave_type: "AL", leave_type_name: "Annual leave", allocated_days: "14.0000", used_days: "3.0000", pending_days: "0.0000", remaining_days: "11.0000" }],
    requests_total: 1,
    requests: [{ id: 1, leave_type: "AL", leave_type_name: "Annual leave", from_date: "2026-10-01", to_date: "2026-10-02", days: "2.0000", status: "APPROVED", reason: "Family" }],
  },
  attendance: {
    allowed: true,
    this_month: { from_date: "2026-11-01", days_recorded: 10, present: 9, absent: 1, late_days: 2, late_minutes: 35, overtime_minutes: 0 },
    this_year: { from_date: "2026-01-01", days_recorded: 200, present: 190, absent: 10, late_days: 12, late_minutes: 300, overtime_minutes: 0 },
    approved_overtime_hours_this_year: "4.5000",
    recent_late: [{ date: "2026-11-03", in_time: "08:20", late_minutes: 20, status: "PRESENT" }],
  },
  discipline: { allowed: false },
  salary: { allowed: false },
  bonuses: { allowed: false },
  payslips: { allowed: false },
  gate_passes: { allowed: false },
  documents: { allowed: true, documents: [] },
  status_history: { allowed: true, entries: [] },
  separations: { allowed: false },
  reviews: { allowed: true, reviews: [] },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/hr/employees/7/profile"]}>
      <Routes>
        <Route path="/app/hr/employees/:employeeId/profile" element={<HrEmployeeProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  flags = {};
  api.getHrEmployee.mockResolvedValue(EMPLOYEE);
  api.getHrEmployeeOverview.mockResolvedValue(OVERVIEW);
  api.getHrEmployeeAccess.mockResolvedValue({ can_manage_payroll: false });
  api.listHrDepartments.mockResolvedValue([]);
  api.listHrDesignations.mockResolvedValue([]);
  api.listHrSections.mockResolvedValue([{ id: 3, code: "L1", name: "Line 1", section_type: "LINE" }]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrEmployeeProfilePage", () => {
  it("shows a read-only view with Undefined department, masked fields, tiles and Edit / Print", async () => {
    renderPage();
    const header = await screen.findByRole("region", { name: "Employee header" });
    expect(within(header).getByText(/Undefined · Line 1/)).toBeTruthy();
    expect(within(header).getByText("No photo")).toBeTruthy();
    expect(screen.getAllByText("Hidden for your role").length).toBeGreaterThan(0); // NID is masked
    expect(screen.getByText("11 days")).toBeTruthy(); // leave remaining tile
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/app/hr/employees/7");
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull(); // nothing editable
    expect(api.updateHrEmployee).not.toHaveBeenCalled();
    expect(photoBlob).not.toHaveBeenCalled();
  });

  it("lists leave and late days, and blocks without permission say so", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Leave" }));
    // The print-only sheet renders the same tables too (jsdom ignores print CSS), so take the first.
    expect(screen.getAllByRole("table", { name: "Leave applications" })[0]!.textContent).toContain("Family");
    await user.click(screen.getByRole("tab", { name: "Attendance & late" }));
    expect(screen.getAllByRole("table", { name: "Recent late days" })[0]!.textContent).toContain("08:20");
    await user.click(screen.getByRole("tab", { name: "Discipline" }));
    expect(screen.getAllByText("Hidden for your role").length).toBeGreaterThan(0);
  });

  it("prints every section with the signature lines", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
    const sheet = screen.getByTestId("print-sheet");
    expect(sheet.textContent).toContain("Authorised signatory");
    expect(sheet.textContent).toContain("Annual leave");
  });

  it("shows the approval note when the change approval flag is on", async () => {
    flags = { hr_employee_change_approval: true };
    renderPage();
    expect(await screen.findByText(/need Tier 1 and Tier 2 approval/)).toBeTruthy();
  });
});

describe("employeeProfileLogic", () => {
  it("formats values and builds a newest-first timeline", () => {
    expect(show(null)).toBe("—");
    expect(show("x", { masked: true })).toBe("Hidden for your role");
    expect(trimDecimal("11.5000")).toBe("11.5");
    const t = buildTimeline(OVERVIEW, EMPLOYEE);
    expect(t.map((e) => e.kind)).toEqual(["Late", "Leave", "Joining"]);
  });
});
