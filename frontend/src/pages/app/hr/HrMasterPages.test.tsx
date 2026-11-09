// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { HrDashboardData, HrDepartmentResponse, HrDesignationResponse } from "@/api/models";
import type { HrSettings } from "@/api/hrSettings";

let me: { feature_flags: Record<string, boolean>; role_name: string } = { feature_flags: {}, role_name: "manager" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me }) }));
vi.mock("@/components/hr/bd/EmployeeNumberFormatCard", () => ({ EmployeeNumberFormatCard: () => null }));

const api = vi.hoisted(() => ({
  listHrDepartments: vi.fn(),
  listHrDesignations: vi.fn(),
  updateHrDepartment: vi.fn(),
  getHrDashboardData: vi.fn(),
  getHrSettings: vi.fn(),
  updateHrSettings: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { HrDashboardPage } from "./HrDashboardPage";
import { HrDepartmentsPage } from "./HrDepartmentsPage";
import { HrDesignationsPage } from "./HrDesignationsPage";
import { HrSettingsPage } from "./HrSettingsPage";

const departments: HrDepartmentResponse[] = [
  { id: 1, tenant_id: 1, code: "DEPT-1", name: "Sewing", is_active: true },
  { id: 2, tenant_id: 1, code: "DEPT-2", name: "Cutting", is_active: true },
];
const designations: HrDesignationResponse[] = [
  { id: 10, tenant_id: 1, code: "DES-1", title: "Operator", description: null, department_id: 1, is_active: true },
  { id: 11, tenant_id: 1, code: "DES-2", title: "Helper", description: null, department_id: 1, is_active: true },
  { id: 12, tenant_id: 1, code: "DES-3", title: "Driver", description: null, department_id: null, is_active: true },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/app/hr/designations">Sidebar designations</Link>
      <Routes>
        <Route path="/app/hr" element={<HrDashboardPage />} />
        <Route path="/app/hr/settings" element={<HrSettingsPage />} />
        <Route path="/app/hr/departments" element={<HrDepartmentsPage />} />
        <Route path="/app/hr/designations" element={<HrDesignationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  me = { feature_flags: {}, role_name: "manager" };
  api.listHrDepartments.mockResolvedValue(departments);
  api.listHrDesignations.mockResolvedValue(designations);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("HrDepartmentsPage", () => {
  it("loads every page and shows designation counts per department", async () => {
    renderAt("/app/hr/departments");
    const row = (await screen.findByText("Sewing")).closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "2 designations" }).getAttribute("href")).toBe("/app/hr/designations?department=1");
    expect(within(screen.getByText("Cutting").closest("tr") as HTMLElement).getByText("None yet")).toBeTruthy();
    expect(api.listHrDepartments).toHaveBeenCalledWith({ active_only: false, limit: 500, offset: 0 });
  });

  it("deactivates from the Actions menu and keeps the message after reloading", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.updateHrDepartment.mockResolvedValue({ ...departments[1], is_active: false });
    renderAt("/app/hr/departments");
    const row = (await screen.findByText("Cutting")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(api.updateHrDepartment).toHaveBeenCalledWith(2, { is_active: false });
    await waitFor(() => expect(api.listHrDepartments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Department DEPT-2 deactivated.")).toBeTruthy();
  });

  it("shows 'unavailable' instead of zero counts when designations fail to load", async () => {
    api.listHrDesignations.mockRejectedValue(new Error("boom"));
    renderAt("/app/hr/departments");
    const row = (await screen.findByText("Sewing")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/Designation counts are unavailable/)).toBeTruthy();
  });

  it("hides Excel export from roles the server would refuse", async () => {
    me = { feature_flags: {}, role_name: "hr officer" };
    renderAt("/app/hr/departments");
    await screen.findByText("Sewing");
    expect(screen.queryByRole("button", { name: "Export (Excel)" })).toBeNull();
  });
});

describe("HrDesignationsPage", () => {
  it("starts filtered to the department in the address", async () => {
    renderAt("/app/hr/designations?department=1");
    expect(await screen.findByText("Operator")).toBeTruthy();
    expect(screen.getByText("Helper")).toBeTruthy();
    expect(screen.queryByText("Driver")).toBeNull();
    expect((screen.getByRole("combobox", { name: "Department" }) as HTMLSelectElement).value).toBe("1");
  });

  it("follows the address: the drop-down updates it and a plain sidebar link clears the filter", async () => {
    const user = userEvent.setup();
    renderAt("/app/hr/designations");
    await screen.findByText("Driver");
    await user.selectOptions(screen.getByRole("combobox", { name: "Department" }), "1");
    expect(screen.queryByText("Driver")).toBeNull();
    await user.click(screen.getByRole("link", { name: "Sidebar designations" }));
    expect(await screen.findByText("Driver")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Department" }) as HTMLSelectElement).value).toBe("");
  });

  it("falls back to all designations for an unknown department id", async () => {
    renderAt("/app/hr/designations?department=999");
    expect(await screen.findByText("Driver")).toBeTruthy();
    expect(screen.getByText(/department was not found/)).toBeTruthy();
  });

  it("filters to designations without a department from the stat card", async () => {
    const user = userEvent.setup();
    renderAt("/app/hr/designations");
    await screen.findByText("Operator");
    await user.click(screen.getByRole("button", { name: /No department/ }));
    expect(screen.getByText("Driver")).toBeTruthy();
    expect(screen.queryByText("Operator")).toBeNull();
  });
});

describe("HrDashboardPage", () => {
  const base: HrDashboardData = {
    total_employees: 120,
    active_employees: 100,
    pending_leave_requests: 0,
    pending_payroll_approvals: 0,
    open_recruitment_requisitions: 0,
    today_attendance_entries: 92,
    today_attendance_rate_percent: 92,
  };

  it("lists what needs attention, with a link to act on it", async () => {
    api.getHrDashboardData.mockResolvedValue({ ...base, pending_leave_requests: 3 });
    renderAt("/app/hr");
    expect(await screen.findByText(/leave request\(s\) waiting for approval/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review leave" }).getAttribute("href")).toBe("/app/hr/leave/approvals");
    expect(screen.getByRole("progressbar", { name: "Attendance rate today" }).getAttribute("aria-valuenow")).toBe("92");
  });

  it("says all caught up when nothing is waiting", async () => {
    api.getHrDashboardData.mockResolvedValue(base);
    renderAt("/app/hr");
    expect(await screen.findByText(/All caught up/)).toBeTruthy();
  });

  it("offers + Add employee only when the unified workspace is on", async () => {
    api.getHrDashboardData.mockResolvedValue(base);
    renderAt("/app/hr");
    await screen.findByText(/All caught up/);
    expect(screen.queryByRole("link", { name: "+ Add employee" })).toBeNull();
    cleanup();
    me = { feature_flags: { hr_onboarding_workspace_v2: true }, role_name: "manager" };
    renderAt("/app/hr");
    expect((await screen.findByRole("link", { name: "+ Add employee" })).getAttribute("href")).toBe("/app/hr/employees/new");
  });

  it("does not announce navigation cards as toggle buttons", async () => {
    api.getHrDashboardData.mockResolvedValue(base);
    renderAt("/app/hr");
    const card = await screen.findByRole("button", { name: /Total employees/ });
    expect(card.hasAttribute("aria-pressed")).toBe(false);
  });
});

describe("HrSettingsPage", () => {
  const settings: HrSettings = {
    weekend_days: ["friday"],
    weekend_days_is_default: false,
    ot_from_salary_enabled: false,
    ot_hours_per_month: 208,
    ot_multiplier: 2,
    can_edit_weekend: true,
    can_edit_overtime: true,
  };

  it("enables Save weekend only after a change, then saves the chosen days", async () => {
    const user = userEvent.setup();
    api.getHrSettings.mockResolvedValue(settings);
    api.updateHrSettings.mockResolvedValue({ ...settings, weekend_days: ["friday", "saturday"] });
    renderAt("/app/hr/settings");
    const save = (await screen.findByRole("button", { name: "Save weekend" })) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Saturday" }));
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
    await user.click(save);
    expect(api.updateHrSettings).toHaveBeenCalledWith({ weekend_days: ["friday", "saturday"] });
    expect(await screen.findByText("Weekend days saved")).toBeTruthy();
  });

  it("keeps unsaved weekend changes when overtime is reset", async () => {
    const user = userEvent.setup();
    api.getHrSettings.mockResolvedValue(settings);
    renderAt("/app/hr/settings");
    await user.click(await screen.findByRole("button", { name: "Saturday" }));
    await user.click(screen.getByRole("checkbox", { name: "Pay overtime from salary" }));
    await user.click(screen.getAllByRole("button", { name: "Reset" })[1] as HTMLElement);
    expect((screen.getByRole("checkbox", { name: "Pay overtime from salary" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("button", { name: "Saturday" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lets the unsaved default weekend be saved as it is", async () => {
    api.getHrSettings.mockResolvedValue({ ...settings, weekend_days_is_default: true });
    renderAt("/app/hr/settings");
    const save = (await screen.findByRole("button", { name: "Save weekend" })) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });
});
