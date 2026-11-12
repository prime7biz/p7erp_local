// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  HrCompensationOptions,
  HrEmployeeAccess,
  HrEmployeeCompensationView,
  HrEmployeePaySnapshot,
  HrEmployeeResponse,
  HrOnboardingRequest,
  HrOnboardingRun,
} from "@/api/models";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));
vi.mock("@/components/shell/recordBreadcrumb", () => ({ useRecordBreadcrumb: () => undefined }));
vi.mock("@/api/hrBangladesh", () => ({
  hrBangladeshApi: { employeeNumberFormat: () => Promise.resolve({ prefix: "EMP-", width: 4, next_code: "EMP-0001" }) },
}));

type Extraction = { status: string; response: { success: boolean; document_type: string; fields: Record<string, unknown>; unmapped_text: string[]; warnings: string[] } | null };
let nidExtraction: Extraction = { status: "idle", response: null };
vi.mock("@/hooks/useHrDocExtraction", () => ({
  useHrDocExtraction: (kind: string) => ({
    ...(kind === "national-id" ? nidExtraction : { status: "idle", response: null }),
    error: null,
    extract: vi.fn(),
    clear: vi.fn(),
  }),
}));

const api = vi.hoisted(() => ({
  getHrEmployeeAccess: vi.fn(),
  listHrDepartments: vi.fn(),
  listHrDesignations: vi.fn(),
  listHrSections: vi.fn(),
  listHrEmployees: vi.fn(),
  getHrCompensationOptions: vi.fn(),
  previewHrCompensation: vi.fn(),
  startHrOnboarding: vi.fn(),
  resumeHrOnboarding: vi.fn(),
  createHrEmployee: vi.fn(),
  getHrEmployee: vi.fn(),
  getHrEmployeeCompensation: vi.fn(),
  getHrEmployeeTaxProfile: vi.fn(() => new Promise(() => {})),
  updateHrEmployee: vi.fn(),
  replaceHrEmployeeCompensation: vi.fn(),
  getHrEmployeePayBenefits: vi.fn(),
  replaceHrEmployeePayBenefits: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { EmployeeWorkspace } from "./EmployeeWorkspace";

const CLERK: HrEmployeeAccess = {
  can_view_sensitive: true, can_manage_identity: false, can_manage_payroll: false, can_manage_gate_pass: false,
  can_generate_documents: true, can_view_compliance: true, can_manage_compliance: false,
  masked_fields: ["salary_payment_method", "bank_account_name", "bank_account_number", "bank_name", "bank_branch", "bank_routing_no"],
};

function run(request: HrOnboardingRequest): HrOnboardingRun {
  return {
    run_id: 1, request_id: request.request_id, status: "COMPLETED",
    steps: { employee: "COMPLETED", payroll: "SKIPPED", gate_pass: "SKIPPED", checklist: "COMPLETED" },
    employee: { id: 5, employee_code: "EMP-0001", first_name: request.employee.first_name } as HrOnboardingRun["employee"],
    payroll_assignment_id: null, wage_assignment_id: null, gate_pass: null, error: null,
  };
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={["/app/hr/employees/new"]}>
      <EmployeeWorkspace mode="create" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  flags = {};
  nidExtraction = { status: "idle", response: null };
  api.getHrEmployeeAccess.mockResolvedValue(CLERK);
  api.listHrDepartments.mockResolvedValue([]);
  api.listHrDesignations.mockResolvedValue([]);
  api.listHrSections.mockResolvedValue([]);
  api.listHrEmployees.mockResolvedValue([]);
  api.startHrOnboarding.mockImplementation((body: HrOnboardingRequest) => Promise.resolve(run(body)));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("EmployeeWorkspace (create mode)", () => {
  it("locks the record tabs until the employee is created", async () => {
    renderCreate();
    const photo = (await screen.findByRole("tab", { name: /Photo & biometrics/ })) as HTMLButtonElement;
    expect(photo.disabled).toBe(true);
    expect(photo.title).toBe("Save employee first to unlock");
    for (const name of ["Documents", "Status history", "Production", "Checklist"]) {
      expect((screen.getByRole("tab", { name: new RegExp(name) }) as HTMLButtonElement).disabled).toBe(true);
    }
    for (const name of ["Personal", "Employment & Salary"]) {
      expect((screen.getByRole("tab", { name }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.queryByRole("tab", { name: "Job" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Salary" })).toBeNull();
    expect(screen.queryByText("AI autofill")).toBeNull(); // no OCR flag on
    expect(screen.getByText(/Core details 1 of 2/)).toBeTruthy();
  });

  it("without the payroll permission the Employment & Salary tab still works but offers no salary set-up", async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("tab", { name: "Employment & Salary" }));
    expect(screen.getByLabelText("Joining date")).toBeTruthy();
    expect(screen.getByText(/need the payroll permission/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Set salary now/)).toBeNull();
    expect(api.getHrCompensationOptions).not.toHaveBeenCalled();
  });

  it("creates through /hr/onboarding with a stable request id and leaves out fields the user may not set", async () => {
    const user = userEvent.setup();
    api.startHrOnboarding.mockRejectedValueOnce(new Error("Network error"));
    renderCreate();
    await user.type(await screen.findByLabelText("First name *"), "Rahima");
    const create = screen.getByRole("button", { name: "Create employee" });
    await user.click(create);
    expect(await screen.findByText("Network error")).toBeTruthy();
    await user.click(create);

    expect(await screen.findByText("EMP-0001 created")).toBeTruthy();
    expect(api.createHrEmployee).not.toHaveBeenCalled();
    expect(api.startHrOnboarding).toHaveBeenCalledTimes(2);
    const calls = api.startHrOnboarding.mock.calls.map((c) => c[0] as HrOnboardingRequest);
    const first = calls[0]!;
    const second = calls[1]!;
    expect(first.request_id).toMatch(/^onb-/);
    expect(second.request_id).toBe(first.request_id); // the retry can never create a second employee
    expect(second.employee.first_name).toBe("Rahima");
    expect(second.employee).not.toHaveProperty("nationality"); // clerk lacks hr.identity.manage
    expect(second.employee).not.toHaveProperty("present_country");
    expect(second.compensation).toBeNull();
    expect(second.issue_temp_gate_pass).toBe(false);
  });

  it("AI autofill fills empty fields but never overwrites what the user typed", async () => {
    const user = userEvent.setup();
    flags = { ocr_id_extraction_enabled: true };
    renderCreate();
    expect(await screen.findByText("AI autofill")).toBeTruthy();
    const firstName = screen.getByLabelText("First name *") as HTMLInputElement;
    await user.type(firstName, "Typed");

    nidExtraction = {
      status: "extracted",
      response: {
        success: true, document_type: "national-id", unmapped_text: [], warnings: [],
        fields: { first_name: { value: "Ocr" }, national_id: { value: "1234567890" } },
      },
    };
    await user.type(screen.getByLabelText("Last name"), "K"); // any re-render delivers the finished extraction

    await waitFor(() => expect((screen.getByLabelText("NID") as HTMLInputElement).value).toBe("1234567890"));
    expect(firstName.value).toBe("Typed");
    expect(screen.getByText(/AI read “Ocr”/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Use AI value" }));
    expect((screen.getByLabelText("First name *") as HTMLInputElement).value).toBe("Ocr");
  });

  it("asks before following a link only when there are unsaved changes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCreate();
    const employeesLink = await screen.findByRole("link", { name: "Employees" });
    await user.click(employeesLink);
    expect(confirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("First name *"), "Unsaved");
    await user.click(screen.getByRole("link", { name: "Employees" }));
    expect(confirm).toHaveBeenCalledWith("Leave without saving? Your changes will be lost.");
    expect((screen.getByLabelText("First name *") as HTMLInputElement).value).toBe("Unsaved");
  });
});

// --- Salary on the Employment & Salary tab -----------------------------------------------------------

const PAYROLL: HrEmployeeAccess = {
  can_view_sensitive: true, can_manage_identity: true, can_manage_payroll: true, can_manage_gate_pass: false,
  can_generate_documents: false, can_view_compliance: false, can_manage_compliance: false, masked_fields: [],
};
const OPTIONS: HrCompensationOptions = {
  as_of: "2026-11-09",
  structures: [{ id: 4, code: "BD-W-G4", name: "Worker grade 4" }],
  wage_grades: [
    { id: 9, rate_code: "W-G4", grade_code: "4", schedule_class: "WORKER", employment_stage: "REGULAR", basic: "7050.0000", gross: "12500.0000" },
  ],
};
const VALID = { minimum_basic: "7050.0000", minimum_gross: "12500.0000", basic: "7050.0000", gross: "12500.0000", meets_minimum: true, message: null };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function openSalaryCreate(user: ReturnType<typeof userEvent.setup>) {
  renderCreate();
  await user.type(await screen.findByLabelText("First name *"), "Rahima");
  await user.click(screen.getByRole("tab", { name: "Employment & Salary" }));
  await user.click(await screen.findByLabelText(/^Set salary now/));
}

describe("EmployeeWorkspace (create mode): salary set-up", () => {
  beforeEach(() => {
    api.getHrEmployeeAccess.mockResolvedValue(PAYROLL);
    api.getHrCompensationOptions.mockResolvedValue(OPTIONS);
    api.previewHrCompensation.mockResolvedValue(VALID);
  });

  it("a ticked but incomplete salary blocks creating the employee", async () => {
    const user = userEvent.setup();
    await openSalaryCreate(user);
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText(/Salary set-up: Choose a salary structure/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText(/Salary set-up: Enter the basic salary/)).toBeTruthy();
    expect(api.startHrOnboarding).not.toHaveBeenCalled();
  });

  it("a salary below the legal minimum, or with no start date at all, blocks creating the employee", async () => {
    const user = userEvent.setup();
    api.previewHrCompensation.mockResolvedValue({ ...VALID, meets_minimum: false, message: "Basic 5000.00 is below the W-G4 minimum basic 7050" });
    await openSalaryCreate(user);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    await user.click(screen.getByLabelText("Override standard basic salary"));
    await user.type(screen.getByLabelText("Employee basic salary *"), "5000");
    await user.click(screen.getByLabelText(/I confirm this employee's basic salary/));
    expect((await screen.findAllByText(/below the W-G4 minimum/, {}, { timeout: 2000 })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText(/Salary set-up: Basic 5000.00 is below/)).toBeTruthy();
    expect(api.startHrOnboarding).not.toHaveBeenCalled();
  });

  it("when salary options fail to load, the salary cannot be completed and nothing is created", async () => {
    const user = userEvent.setup();
    api.getHrCompensationOptions.mockRejectedValue(new Error("offline"));
    await openSalaryCreate(user);
    expect(screen.getByText(/Salary options did not load/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText(/Salary set-up: Choose a salary structure/)).toBeTruthy();
    expect(api.startHrOnboarding).not.toHaveBeenCalled();
  });

  it("switching salary set-up off sends no salary, even with values still chosen", async () => {
    const user = userEvent.setup();
    await openSalaryCreate(user);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    await user.click(screen.getByLabelText(/^Set salary now/));
    await user.click(screen.getByRole("button", { name: "Create employee" }));
    expect(await screen.findByText("EMP-0001 created")).toBeTruthy();
    expect((api.startHrOnboarding.mock.calls[0]![0] as HrOnboardingRequest).compensation).toBeNull();
  });

  it("creates with the grade standard on today's company date, and a double click sends one request", async () => {
    const user = userEvent.setup();
    const pending = deferred<HrOnboardingRun>();
    api.startHrOnboarding.mockReturnValueOnce(pending.promise);
    await openSalaryCreate(user);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    expect(await screen.findByText(/Basic 7050 · Gross 12500/, {}, { timeout: 2000 })).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create employee" });
    await user.dblClick(create);
    expect(api.startHrOnboarding).toHaveBeenCalledTimes(1);
    const body = api.startHrOnboarding.mock.calls[0]![0] as HrOnboardingRequest;
    expect(body.compensation).toEqual({ structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-09" });
    pending.resolve(run(body));
    expect(await screen.findByText("EMP-0001 created")).toBeTruthy();
  });
});

const EMPLOYEE = {
  id: 7, tenant_id: 1, employee_code: "EMP-0007", first_name: "Karim", last_name: null, email: null, phone: null,
  reporting_manager_id: null, user_id: null, department_id: null, designation_id: null, section_id: null,
  employee_category: null, joining_date: "2026-01-01", date_of_birth: null, gender: null, marital_status: null,
  blood_group: null, emergency_contact_name: null, emergency_contact_phone: null, address_line: null, city: null,
  country: null, national_id: null, employment_type: null, confirmation_date: null, exit_date: null, is_active: true,
  attendance_device_pin: null, masked_fields: [],
} as unknown as HrEmployeeResponse;

function view(snapshot: Partial<HrEmployeePaySnapshot>): HrEmployeeCompensationView {
  return {
    employee_id: 7,
    snapshot: {
      as_of: "2026-11-09", basic: "7050.0000", gross: "12500.0000", structure_id: 4, structure_code: "BD-W-G4",
      structure_assignment_id: 1, structure_effective_from: "2026-01-01", structure_effective_to: null, wage_rate_id: 9,
      wage_rate_code: "W-G4", wage_grade_basic: "7050.0000", wage_grade_gross: "12500.0000", wage_assignment_id: 2,
      wage_effective_from: "2026-01-01", ...snapshot,
    },
    structure_assignments: [],
    wage_assignments: [],
  };
}

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={["/app/hr/employees/7"]}>
      <Routes>
        <Route path="/app/hr/employees/:employeeId" element={<EmployeeWorkspace mode="edit" />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole("tab", { name: "Employment & Salary" }));
}

describe("EmployeeWorkspace (edit mode): separate employment and salary saves", () => {
  beforeEach(() => {
    api.getHrEmployeeAccess.mockResolvedValue(PAYROLL);
    api.getHrCompensationOptions.mockResolvedValue(OPTIONS);
    api.previewHrCompensation.mockResolvedValue(VALID);
    api.getHrEmployee.mockResolvedValue(EMPLOYEE);
    api.getHrEmployeeCompensation.mockResolvedValue(view({}));
    api.getHrEmployeePayBenefits.mockResolvedValue({ employee_id: 7, benefits: [] });
  });

  it("overtime and bill switches load and save on their own", async () => {
    const user = userEvent.setup();
    api.getHrEmployeePayBenefits.mockResolvedValue({
      employee_id: 7,
      benefits: [{ benefit_code: "LUNCH", enabled: true, amount_override: "80.0000" }],
    });
    api.replaceHrEmployeePayBenefits.mockImplementation((_id: number, benefits: unknown) =>
      Promise.resolve({ employee_id: 7, benefits }),
    );
    await openEdit(user);
    expect(((await screen.findByLabelText("Lunch bill own amount")) as HTMLInputElement).value).toBe("80");
    const save = screen.getByRole("button", { name: "Save overtime & allowances" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet
    await user.click(screen.getByLabelText(/^Overtime/));
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);
    expect(await screen.findByText("Overtime & allowances saved.")).toBeTruthy();
    const sent = api.replaceHrEmployeePayBenefits.mock.calls[0]?.[1] as { benefit_code: string; enabled: boolean; amount_override: string | null }[];
    expect(sent.find((b) => b.benefit_code === "OVERTIME")).toEqual({ benefit_code: "OVERTIME", enabled: false, amount_override: null });
    expect(sent.find((b) => b.benefit_code === "LUNCH")).toEqual({ benefit_code: "LUNCH", enabled: true, amount_override: "80" });
    expect(api.replaceHrEmployeeCompensation).not.toHaveBeenCalled();
  });

  it("Change salary starts from the pay in force: above the grade means an override of the current basic", async () => {
    const user = userEvent.setup();
    api.getHrEmployeeCompensation.mockResolvedValue(view({ basic: "8000.0000", gross: "14000.0000" }));
    await openEdit(user);
    expect(await screen.findByText("8000 / 14000")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Change salary" }));
    expect((screen.getByLabelText("Salary structure *") as HTMLSelectElement).value).toBe("4");
    const grade = screen.getByLabelText("Bangladesh wage grade") as HTMLSelectElement;
    expect(grade.value).toBe("9");
    expect([...grade.options].some((o) => o.value === "")).toBe(false); // the grade in force cannot be removed here
    expect((screen.getByLabelText("Override standard basic salary") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Employee basic salary *") as HTMLInputElement).value).toBe("8000");
    expect((screen.getByLabelText("New salary starts on *") as HTMLInputElement).value).toBe("");
  });

  it("grade-minimum and no-grade pay start without an override", async () => {
    const user = userEvent.setup();
    await openEdit(user);
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    expect((screen.getByLabelText("Override standard basic salary") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Employee basic salary *")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    api.getHrEmployeeCompensation.mockResolvedValue(view({ wage_rate_id: null, wage_rate_code: null, wage_grade_basic: null, basic: "20000.0000" }));
    cleanup();
    await openEdit(user);
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    expect((screen.getByLabelText("Basic salary *") as HTMLInputElement).value).toBe("20000");
    expect(screen.queryByLabelText("Override standard basic salary")).toBeNull();
  });

  it("an unsaved joining date blocks the salary until employment is saved and the salary re-checked", async () => {
    const user = userEvent.setup();
    api.updateHrEmployee.mockResolvedValue({ ...EMPLOYEE, joining_date: "2026-02-01" });
    await openEdit(user);
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    await user.type(screen.getByLabelText("New salary starts on *"), "2026-12-01");
    const save = screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false), { timeout: 2000 });

    await user.clear(screen.getByLabelText("Joining date"));
    await user.type(screen.getByLabelText("Joining date"), "2026-02-01");
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Save employment first/)).toBeTruthy();
    const previews = api.previewHrCompensation.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Save employment & payment" }));
    expect(await screen.findByText("Employment & payment saved.")).toBeTruthy();
    expect(api.updateHrEmployee).toHaveBeenCalledWith(7, { joining_date: "2026-02-01" });
    expect(api.replaceHrEmployeeCompensation).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getHrEmployeeCompensation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.previewHrCompensation.mock.calls.length).toBeGreaterThan(previews), { timeout: 2000 });
    await waitFor(() => expect(save.disabled).toBe(false), { timeout: 2000 });
  });

  it("a successful salary save closes the form and shows the new pay", async () => {
    const user = userEvent.setup();
    api.replaceHrEmployeeCompensation.mockResolvedValue(view({ basic: "9000.0000", gross: "15000.0000" }));
    await openEdit(user);
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    await user.click(screen.getByLabelText("Override standard basic salary"));
    await user.type(screen.getByLabelText("Employee basic salary *"), "9000");
    await user.click(screen.getByLabelText(/I confirm this employee's basic salary/));
    await user.type(screen.getByLabelText("New salary starts on *"), "2026-12-01");
    const save = screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false), { timeout: 2000 });
    await user.click(save);
    expect(await screen.findByText("New salary saved from 2026-12-01.")).toBeTruthy();
    expect(api.replaceHrEmployeeCompensation).toHaveBeenCalledWith(7, {
      structure_id: 4, bd_wage_rate_id: 9, base_salary: "9000", effective_from: "2026-12-01", change_type: "INCREMENT", change_note: null,
    });
    expect(screen.getByText("9000 / 15000")).toBeTruthy();
    expect(screen.queryByLabelText("New salary starts on *")).toBeNull();
    expect(screen.getByRole("button", { name: "Change salary" })).toBeTruthy();
  });

  it("a failed employment save keeps the open salary form and never saves the salary", async () => {
    const user = userEvent.setup();
    api.updateHrEmployee.mockRejectedValueOnce(new Error("Attendance device PIN already exists"));
    await openEdit(user);
    await user.type(screen.getByLabelText("Device PIN"), "55");
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    await user.type(screen.getByLabelText("New salary starts on *"), "2026-12-01");
    await user.click(screen.getByRole("button", { name: "Save employment & payment" }));
    expect(await screen.findByText(/Employment & payment not saved: Attendance device PIN already exists/)).toBeTruthy();
    expect((screen.getByLabelText("Device PIN") as HTMLInputElement).value).toBe("55");
    expect((screen.getByLabelText("New salary starts on *") as HTMLInputElement).value).toBe("2026-12-01");
    expect(api.replaceHrEmployeeCompensation).not.toHaveBeenCalled();
  });

  it("without the payroll permission employment still saves, and no salary is loaded or offered", async () => {
    const user = userEvent.setup();
    api.getHrEmployeeAccess.mockResolvedValue({ ...PAYROLL, can_manage_payroll: false, masked_fields: ["bank_account_number"] });
    api.updateHrEmployee.mockResolvedValue({ ...EMPLOYEE, attendance_device_pin: "77" });
    await openEdit(user);
    expect(screen.queryByRole("button", { name: "Change salary" })).toBeNull();
    expect(screen.getByText(/need the payroll permission/)).toBeTruthy();
    await user.type(screen.getByLabelText("Device PIN"), "77");
    await user.click(screen.getByRole("button", { name: "Save employment & payment" }));
    expect(await screen.findByText("Employment & payment saved.")).toBeTruthy();
    expect(api.updateHrEmployee).toHaveBeenCalledWith(7, { attendance_device_pin: "77" });
    expect(api.getHrEmployeeCompensation).not.toHaveBeenCalled();
    expect(api.getHrCompensationOptions).not.toHaveBeenCalled();
    expect(api.previewHrCompensation).not.toHaveBeenCalled();
  });

  it("a failed salary save keeps the salary form and does not touch employment edits", async () => {
    const user = userEvent.setup();
    api.replaceHrEmployeeCompensation.mockRejectedValueOnce(new Error("Payroll is finalized up to 2026-11-30"));
    api.updateHrEmployee.mockResolvedValue({ ...EMPLOYEE, attendance_device_pin: "55" });
    await openEdit(user);
    await user.type(screen.getByLabelText("Device PIN"), "55");
    await user.click(await screen.findByRole("button", { name: "Change salary" }));
    await user.type(screen.getByLabelText("New salary starts on *"), "2026-11-15");
    const save = screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false), { timeout: 2000 });
    await user.click(save);

    expect(await screen.findByText(/Salary not saved: Payroll is finalized up to 2026-11-30/)).toBeTruthy();
    expect(api.replaceHrEmployeeCompensation).toHaveBeenCalledWith(7, {
      structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15", change_type: "INCREMENT", change_note: null,
    });
    expect((screen.getByLabelText("New salary starts on *") as HTMLInputElement).value).toBe("2026-11-15");
    expect((screen.getByLabelText("Device PIN") as HTMLInputElement).value).toBe("55");
    expect(api.updateHrEmployee).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save employment & payment" }));
    expect(await screen.findByText("Employment & payment saved.")).toBeTruthy();
    expect(api.updateHrEmployee).toHaveBeenCalledWith(7, { attendance_device_pin: "55" });
    expect((screen.getByLabelText("New salary starts on *") as HTMLInputElement).value).toBe("2026-11-15");
  });
});

