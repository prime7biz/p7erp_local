// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { HrCompensationComponent, HrCompensationOptions, HrCompensationPreview, HrEmployeeCompensationView } from "@/api/models";

const previewHrCompensation = vi.fn();
vi.mock("@/api/client", () => ({ api: { previewHrCompensation: (...a: unknown[]) => previewHrCompensation(...a) } }));

import {
  emptyEmployeeForm,
  emptySalaryForm,
  previewableCompensation,
  resolveSalaryEffectiveDate,
  salaryBlocker,
  updateSalary,
  type EmployeeFormState,
  type SalaryFormState,
  type WorkspaceMode,
} from "./employeeWorkspaceLogic";
import { SalaryTab } from "./SalaryTab";
import { useCompensationPreview } from "./useCompensationPreview";

const OPTIONS: HrCompensationOptions = {
  as_of: "2026-11-09",
  structures: [{ id: 4, code: "BD-W-G4", name: "Worker grade 4" }],
  wage_grades: [
    { id: 9, rate_code: "W-G4", grade_code: "4", schedule_class: "WORKER", employment_stage: "REGULAR", basic: "7050.0000", gross: "12500.0000" },
  ],
};

afterEach(() => {
  cleanup();
  previewHrCompensation.mockReset();
});

/** Same wiring as EmployeeWorkspace: salary form + live preview + blocker. */
function Harness({
  mode = "create",
  canManagePayroll = true,
  masked = [],
  joiningDate = "2026-11-15",
  initialSalary,
  onSave = vi.fn(),
  onForm,
  options = OPTIONS,
  current = null,
}: {
  mode?: WorkspaceMode;
  canManagePayroll?: boolean;
  masked?: string[];
  joiningDate?: string;
  initialSalary?: SalaryFormState;
  onSave?: () => void;
  onForm?: (f: EmployeeFormState) => void;
  options?: HrCompensationOptions;
  current?: HrEmployeeCompensationView | null;
}) {
  const [salary, setSalary] = useState(initialSalary ?? emptySalaryForm());
  const [form, setForm] = useState({ ...emptyEmployeeForm(), joining_date: joiningDate });
  const effective = resolveSalaryEffectiveDate(salary, mode, form.joining_date, OPTIONS.as_of);
  const preview = useCompensationPreview(previewableCompensation(salary, effective.date), canManagePayroll && salary.enabled, 0, 0);
  const blocker = salaryBlocker(salary, effective.date, preview, { mode, joiningDate: form.joining_date });
  return (
    <MemoryRouter>
      <SalaryTab
        mode={mode}
        canManagePayroll={canManagePayroll}
        options={options}
        current={current}
        salary={salary}
        onSalaryChange={(patch) => setSalary((p) => updateSalary(p, patch))}
        preview={preview}
        effective={effective}
        blocker={blocker}
        form={form}
        setField={(k, v) =>
          setForm((p) => {
            const next = { ...p, [k]: v };
            onForm?.(next);
            return next;
          })
        }
        masked={new Set(masked)}
        onSaveSalary={mode === "edit" ? onSave : undefined}
        onCancelChange={() => setSalary(emptySalaryForm())}
      />
    </MemoryRouter>
  );
}

const preview = (p: Partial<HrCompensationPreview>): HrCompensationPreview => ({
  minimum_basic: "7050.0000", minimum_gross: "12500.0000", basic: null, gross: null, meets_minimum: true, message: null, ...p,
});
const openEdit = { ...emptySalaryForm(), enabled: true };

describe("Employment & Salary: salary set-up", () => {
  it("create: salary set-up is optional and the start date follows the joining date", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByLabelText("Salary structure *")).toBeNull();
    await user.click(screen.getByLabelText(/^Set salary now/));
    expect(screen.getByLabelText("Salary structure *")).toBeTruthy();
    expect(screen.getByText(/Taken from the joining date/)).toBeTruthy();
    expect((screen.getByLabelText("Salary starts on") as HTMLInputElement).value).toBe("2026-11-15");
    await user.click(screen.getByLabelText(/^Set salary now/));
    expect(screen.queryByLabelText("Salary structure *")).toBeNull();
  });

  it("create: without a joining date the salary visibly starts on today's company date", async () => {
    const user = userEvent.setup();
    render(<Harness joiningDate="" />);
    await user.click(screen.getByLabelText(/^Set salary now/));
    expect(screen.getByText(/No joining date yet, so the salary starts today \(2026-11-09\)/)).toBeTruthy();
  });

  it("a grade sets the standard basic; no basic is typed or sent unless overridden", async () => {
    const user = userEvent.setup();
    previewHrCompensation.mockResolvedValue(preview({ basic: "7050.0000", gross: "12500.0000" }));
    render(<Harness initialSalary={{ ...emptySalaryForm(), enabled: true }} />);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    expect(screen.getByText("7050 (grade minimum)")).toBeTruthy();
    expect(screen.queryByLabelText(/basic salary \*/i)).toBeNull();
    await waitFor(() =>
      expect(previewHrCompensation).toHaveBeenLastCalledWith({ structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15" }),
    );
    expect(await screen.findByText(/Basic 7050 · Gross 12500/)).toBeTruthy();
    expect(screen.queryByText(/Before you can create/)).toBeNull();
  });

  it("without a grade the basic salary is required (not an override)", async () => {
    const user = userEvent.setup();
    previewHrCompensation.mockResolvedValue(preview({ minimum_basic: null, minimum_gross: null, basic: "20000.0000", gross: "30000.0000" }));
    render(<Harness initialSalary={{ ...emptySalaryForm(), enabled: true }} />);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    expect(screen.getByText(/Enter the basic salary/)).toBeTruthy();
    expect(screen.queryByLabelText("Override standard basic salary")).toBeNull();
    await user.type(screen.getByLabelText("Basic salary *"), "20000");
    await waitFor(() => expect(previewHrCompensation).toHaveBeenLastCalledWith(expect.objectContaining({ base_salary: "20000", bd_wage_rate_id: null })));
    await waitFor(() => expect(screen.queryByText(/Before you can create/)).toBeNull());
    expect(screen.queryByText(/I confirm/)).toBeNull();
  });

  it("edit: an override needs a valid preview, a start date and the confirmation, which resets on change", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    previewHrCompensation.mockResolvedValue(
      preview({ basic: "5000.0000", gross: "9000.0000", meets_minimum: false, message: "Basic 5000.00 is below the W-G4 minimum basic 7050" }),
    );
    render(<Harness mode="edit" onSave={onSave} initialSalary={openEdit} />);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    await user.click(screen.getByLabelText("Override standard basic salary"));
    await user.type(screen.getByLabelText("Employee basic salary *"), "5000");
    const save = screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Choose the date the new salary starts/)).toBeTruthy();
    expect(previewHrCompensation).not.toHaveBeenCalled(); // nothing to check without a date

    await user.type(screen.getByLabelText("New salary starts on *"), "2026-12-01");
    expect((await screen.findAllByText(/below the W-G4 minimum basic/)).length).toBeGreaterThan(0);
    expect(previewHrCompensation).toHaveBeenLastCalledWith({ structure_id: 4, bd_wage_rate_id: 9, base_salary: "5000", effective_from: "2026-12-01" });
    expect(save.disabled).toBe(true);

    previewHrCompensation.mockResolvedValue(preview({ basic: "8000.0000", gross: "14000.0000" }));
    await user.clear(screen.getByLabelText("Employee basic salary *"));
    await user.type(screen.getByLabelText("Employee basic salary *"), "8000");
    expect(await screen.findByText(/Tick the confirmation box/)).toBeTruthy();
    expect(save.disabled).toBe(true);
    await user.click(screen.getByLabelText(/I confirm this employee's basic salary/));
    await waitFor(() => expect(save.disabled).toBe(false));

    await user.type(screen.getByLabelText("Employee basic salary *"), "1");
    expect((screen.getByLabelText(/I confirm this employee's basic salary/) as HTMLInputElement).checked).toBe(false);
    expect(save.disabled).toBe(true);
    await user.click(screen.getByLabelText(/I confirm this employee's basic salary/));
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("a failed preview blocks saving and shows why", async () => {
    const user = userEvent.setup();
    previewHrCompensation.mockRejectedValue(new Error("Server unavailable"));
    render(<Harness mode="edit" initialSalary={{ ...openEdit, effective_from: "2026-12-01" }} />);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.type(screen.getByLabelText("Basic salary *"), "20000");
    expect(await screen.findByText(/Could not check the salary: Server unavailable/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides salary set-up and bank details from users without the payroll permission", () => {
    render(<Harness canManagePayroll={false} masked={["salary_payment_method", "bank_account_number"]} />);
    expect(screen.getByText(/need the payroll permission/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Set salary now/)).toBeNull();
    expect(screen.queryByLabelText("Salary structure *")).toBeNull();
    expect((screen.getByLabelText("Salary paid by") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Account number") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText("Hidden for your role").length).toBeGreaterThan(0);
    expect(previewHrCompensation).not.toHaveBeenCalled();
  });

  it("ticks suggested facilities and adds custom ones", async () => {
    const user = userEvent.setup();
    let last: EmployeeFormState | null = null;
    render(<Harness onForm={(f) => (last = f)} />);
    await user.click(screen.getByLabelText("Transport"));
    await user.type(screen.getByLabelText("Other facility"), "Night snack");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(last!.facilities).toEqual(["Transport", "Night snack"]);
    expect((screen.getByLabelText("Night snack") as HTMLInputElement).checked).toBe(true);
  });

  const WITH_LINES: HrCompensationOptions = {
    ...OPTIONS,
    structures: [
      {
        id: 4,
        code: "BD-W-G4",
        name: "Worker grade 4",
        lines: [
          { component_id: 1, code: "BD-BASIC", name: "Basic wage", component_type: "EARNING", calculation_type: "PERCENT_OF_BASE", amount: "100.0000", is_basic: true, editable: false },
          { component_id: 2, code: "BD-HRENT", name: "House rent", component_type: "EARNING", calculation_type: "PERCENT_OF_BASE", amount: "50.0000", is_basic: false, editable: true },
          { component_id: 3, code: "BD-MEDICAL", name: "Medical", component_type: "EARNING", calculation_type: "FIXED", amount: "750.0000", is_basic: false, editable: true },
        ],
      },
    ],
  };

  it("shows every component of the structure with the grade and sends a typed component amount", async () => {
    const user = userEvent.setup();
    previewHrCompensation.mockResolvedValue(preview({ basic: "7050.0000", gross: "11975.0000" }));
    render(<Harness options={WITH_LINES} initialSalary={{ ...emptySalaryForm(), enabled: true }} />);
    await user.selectOptions(screen.getByLabelText("Salary structure *"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    expect(screen.getByText("Legal minimum")).toBeTruthy();
    expect(screen.getByText("House rent")).toBeTruthy();
    expect(screen.getByText("3525")).toBeTruthy(); // 50% of the grade basic 7050
    expect(screen.queryByLabelText("Basic wage amount for this employee")).toBeNull(); // the basic is not typed in the table
    await user.type(screen.getByLabelText("Medical amount for this employee"), "900");
    await waitFor(() =>
      expect(previewHrCompensation).toHaveBeenLastCalledWith({
        structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15", component_overrides: { "BD-MEDICAL": "900" },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(previewHrCompensation).toHaveBeenLastCalledWith({ structure_id: 4, bd_wage_rate_id: 9, base_salary: null, effective_from: "2026-11-15" }),
    );
  });

  it("edit: the current salary lists every component with own amounts marked", () => {
    const comp = (code: string, name: string, amount: string, extra: Partial<HrCompensationComponent> = {}): HrCompensationComponent => ({
      component_id: 1, code, name, component_type: "EARNING", calculation_type: "FIXED", rule_amount: amount,
      standard_amount: amount, amount, is_basic: false, editable: true, overridden: false, ...extra,
    });
    const current: HrEmployeeCompensationView = {
      employee_id: 7,
      snapshot: {
        as_of: "2026-11-12", basic: "15000.0000", gross: "25000.0000", structure_id: 4, structure_code: "BD-E-G1",
        structure_assignment_id: 1, structure_effective_from: "2026-11-12", structure_effective_to: null, wage_rate_id: 9,
        wage_rate_code: "E-G1", wage_grade_basic: "15000.0000", wage_grade_gross: "25000.0000", wage_assignment_id: 2,
        wage_effective_from: "2026-11-12",
        components: [
          comp("BD-BASIC", "Basic wage", "15000.0000", { calculation_type: "PERCENT_OF_BASE", rule_amount: "100.0000", is_basic: true, editable: false }),
          comp("BD-HRENT", "House rent", "7500.0000", { calculation_type: "PERCENT_OF_BASE", rule_amount: "50.0000" }),
          comp("BD-MEDICAL", "Medical allowance", "1000.0000", { rule_amount: "750.0000", standard_amount: "750.0000", overridden: true }),
          comp("BD-FOOD", "Food allowance", "1500.0000"),
          comp("PF", "Provident fund", "200.0000", { component_type: "DEDUCTION", editable: false }),
        ],
      },
      structure_assignments: [],
      wage_assignments: [],
    };
    render(<Harness mode="edit" current={current} />);
    expect(screen.getByText("Basic wage")).toBeTruthy();
    expect(screen.getByText("50% of basic")).toBeTruthy();
    expect(screen.getByText("7500")).toBeTruthy();
    expect(screen.getByText("Own amount")).toBeTruthy();
    expect(screen.getByText("Standard 750")).toBeTruthy();
    expect(screen.getByText("Gross salary")).toBeTruthy();
    expect(screen.getByText("Deductions")).toBeTruthy();
    expect(screen.getByText("Provident fund")).toBeTruthy();
  });

  it("edit: an increment of 5% types the new basic, which can still be changed", async () => {
    const user = userEvent.setup();
    previewHrCompensation.mockResolvedValue(preview({ basic: "7402.5000", gross: "12000.0000" }));
    const current: HrEmployeeCompensationView = {
      employee_id: 7,
      snapshot: {
        as_of: "2026-11-09", basic: "7050.0000", gross: "12500.0000", structure_id: 4, structure_code: "BD-W-G4",
        structure_assignment_id: 1, structure_effective_from: "2026-01-01", structure_effective_to: null, wage_rate_id: 9,
        wage_rate_code: "W-G4", wage_grade_basic: "7050.0000", wage_grade_gross: "12500.0000", wage_assignment_id: 2,
        wage_effective_from: "2026-01-01",
      },
      structure_assignments: [],
      wage_assignments: [],
    };
    render(
      <Harness
        mode="edit"
        options={WITH_LINES}
        current={current}
        initialSalary={{ ...emptySalaryForm(), enabled: true, structure_id: 4, bd_wage_rate_id: 9, change_type: "INCREMENT" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Use the annual increment \(5%\)/ }));
    expect((screen.getByLabelText("Employee basic salary *") as HTMLInputElement).value).toBe("7402.5");
    await user.clear(screen.getByLabelText("Employee basic salary *"));
    await user.type(screen.getByLabelText("Employee basic salary *"), "7500");
    expect((screen.getByLabelText("Employee basic salary *") as HTMLInputElement).value).toBe("7500");
    await user.selectOptions(screen.getByLabelText("Type of change *"), "CORRECTION");
    expect(screen.getByText(/Fixes a wrong salary/)).toBeTruthy();
  });
});
