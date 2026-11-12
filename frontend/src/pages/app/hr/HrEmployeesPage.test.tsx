// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { HrEmployeeResponse } from "@/api/models";

let me: { feature_flags: Record<string, boolean>; role_name: string } = { feature_flags: {}, role_name: "manager" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me }) }));
vi.mock("@/api/hrBangladesh", () => ({
  hrBangladeshApi: { employeeNumberFormat: () => Promise.resolve({ prefix: "EMP-", width: 5, next_code: "EMP-00003" }) },
}));

const api = vi.hoisted(() => ({
  listHrDepartments: vi.fn(),
  listHrDesignations: vi.fn(),
  listHrSections: vi.fn(),
  listHrEmployees: vi.fn(),
  listUsers: vi.fn(),
  activateHrEmployee: vi.fn(),
  deactivateHrEmployee: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { HrEmployeesPage } from "./HrEmployeesPage";

function emp(id: number, firstName: string): HrEmployeeResponse {
  return {
    id,
    tenant_id: 1,
    employee_code: `EMP-0000${id}`,
    first_name: firstName,
    last_name: null,
    email: null,
    phone: null,
    reporting_manager_id: null,
    user_id: null,
    department_id: null,
    designation_id: null,
    section_id: null,
    employee_category: null,
    joining_date: null,
    date_of_birth: null,
    gender: null,
    marital_status: null,
    blood_group: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    address_line: null,
    city: null,
    country: null,
    national_id: null,
    employment_type: null,
    confirmation_date: null,
    exit_date: null,
    is_active: true,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/hr/employees"]}>
      <Routes>
        <Route path="/app/hr/employees" element={<HrEmployeesPage />} />
        <Route path="/app/hr/employees/new" element={<p>New employee workspace</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  me = { feature_flags: {}, role_name: "manager" };
  localStorage.clear();
  api.listHrDepartments.mockResolvedValue([]);
  api.listHrDesignations.mockResolvedValue([]);
  api.listHrSections.mockResolvedValue([]);
  api.listUsers.mockResolvedValue([]);
  api.listHrEmployees.mockResolvedValue([emp(1, "Rahim"), emp(2, "Karima")]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("HrEmployeesPage", () => {
  it("loads employees in 500-row pages", async () => {
    renderPage();
    expect(await screen.findByText("Rahim")).toBeTruthy();
    expect(api.listHrEmployees).toHaveBeenCalledWith({ active_only: false, limit: 500, offset: 0 });
  });

  it("keeps the failure message visible after a bulk deactivate reloads the list", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.deactivateHrEmployee.mockRejectedValue(new Error("Only manager/admin can perform this action"));
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Select Rahim" }));
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(api.listHrEmployees).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/1 failed\. EMP-00001: Only manager\/admin/)).toBeTruthy();
  });

  it("renders the row Actions menu outside the table so it is never clipped", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText("Karima")).closest("tr");
    expect(row).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Actions" }));
    const view = screen.getByRole("button", { name: "View" });
    expect(view.closest("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeTruthy();
  });

  it("hides client export for roles the server would refuse", async () => {
    const user = userEvent.setup();
    me = { feature_flags: {}, role_name: "hr officer" };
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Select Rahim" }));
    expect(screen.queryByRole("button", { name: "Export selected" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Import \/ Export/ }));
    expect(screen.queryByRole("button", { name: /Export current view/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Export all employees (Excel)" })).toBeTruthy();
  });

  it("shows client export to managers and closes menus with Escape", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Select Rahim" }));
    expect(screen.getByRole("button", { name: "Export selected" })).toBeTruthy();
    const row = screen.getByText("Karima").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
  });

  it("opens the unified workspace for Add employee when the flag is on", async () => {
    const user = userEvent.setup();
    me = { feature_flags: { hr_onboarding_workspace_v2: true }, role_name: "manager" };
    renderPage();
    await screen.findByText("Rahim");
    await user.click(screen.getAllByRole("button", { name: "+ Add employee" })[0] as HTMLElement);
    expect(await screen.findByText("New employee workspace")).toBeTruthy();
  });
});

describe("HrEmployeesPage on a phone (mobile_ui_v2)", () => {
  function mockPhone(isPhone: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("767px") ? isPhone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    // jsdom has no matchMedia; remove the mock so other tests see the desktop default.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("starts on Cards even when the old shared setting says Table", async () => {
    mockPhone(true);
    localStorage.setItem("p7.hr.employees.view", "table");
    me = { feature_flags: { mobile_ui_v2: true }, role_name: "manager" };
    renderPage();
    const name = await screen.findByText("Rahim");
    expect(name.closest("tr")).toBeNull();
    expect(screen.getByRole("button", { name: "Cards" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("remembers Table for phones only", async () => {
    const user = userEvent.setup();
    mockPhone(true);
    me = { feature_flags: { mobile_ui_v2: true }, role_name: "manager" };
    renderPage();
    await screen.findByText("Rahim");
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(localStorage.getItem("p7_list_view:hr.employees")).toBe("table");
    expect(screen.getByText("Rahim").closest("tr")).toBeTruthy();
  });

  it("keeps today's table when the switch is off", async () => {
    mockPhone(true);
    renderPage();
    expect((await screen.findByText("Rahim")).closest("tr")).toBeTruthy();
  });
});
