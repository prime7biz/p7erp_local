// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { HrEmployeeAccess, HrOnboardingRequest, HrOnboardingRun } from "@/api/models";

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
    for (const name of ["Personal", "Job", "Salary"]) {
      expect((screen.getByRole("tab", { name }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.queryByText("AI autofill")).toBeNull(); // no OCR flag on
    expect(screen.getByText(/Core details 1 of 3/)).toBeTruthy();
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
