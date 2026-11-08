// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { HrCompensationOptions, HrCompensationPreview } from "@/api/models";

const previewHrCompensation = vi.fn();
vi.mock("@/api/client", () => ({ api: { previewHrCompensation: (...a: unknown[]) => previewHrCompensation(...a) } }));

import { emptyEmployeeForm, emptySalaryForm, type EmployeeFormState, type WorkspaceMode } from "./employeeWorkspaceLogic";
import { SalaryTab } from "./SalaryTab";

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

function Harness({
  mode = "create",
  canManagePayroll = true,
  masked = [],
  onSave = vi.fn(),
  onForm,
}: {
  mode?: WorkspaceMode;
  canManagePayroll?: boolean;
  masked?: string[];
  onSave?: () => void;
  onForm?: (f: EmployeeFormState) => void;
}) {
  const [salary, setSalary] = useState(emptySalaryForm());
  const [form, setForm] = useState({ ...emptyEmployeeForm(), joining_date: "2026-11-15" });
  return (
    <MemoryRouter>
      <SalaryTab
        mode={mode}
        canManagePayroll={canManagePayroll}
        options={OPTIONS}
        salary={salary}
        setSalary={setSalary}
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
      />
    </MemoryRouter>
  );
}

const preview = (p: Partial<HrCompensationPreview>): HrCompensationPreview => ({
  minimum_basic: "7050.0000", minimum_gross: "12500.0000", basic: null, gross: null, meets_minimum: true, message: null, ...p,
});

describe("Salary tab", () => {
  it("previews the grade minimum and refuses to save below it or without an effective date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    previewHrCompensation.mockResolvedValue(
      preview({ basic: "5000.0000", gross: "9000.0000", meets_minimum: false, message: "Basic 5000.00 is below the W-G4 minimum basic 7050" }),
    );
    render(<Harness mode="edit" onSave={onSave} />);
    await user.selectOptions(screen.getByLabelText("Salary structure"), "4");
    await user.selectOptions(screen.getByLabelText("Bangladesh wage grade"), "9");
    await user.type(screen.getByLabelText("Basic salary"), "5000");

    expect(await screen.findByText(/below the W-G4 minimum basic/)).toBeTruthy();
    expect(screen.getByText(/Legal minimum: basic 7050.0000, gross 12500.0000/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save new salary" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(previewHrCompensation).toHaveBeenLastCalledWith({
      structure_id: 4, bd_wage_rate_id: 9, base_salary: "5000", effective_from: "2026-11-15",
    });

    previewHrCompensation.mockResolvedValue(preview({ basic: "7050.0000", gross: "12500.0000" }));
    await user.clear(screen.getByLabelText("Basic salary"));
    await waitFor(() => expect(screen.queryByText(/below the W-G4/)).toBeNull());
    expect(save.disabled).toBe(true); // an edit needs its own effective date
    await user.type(screen.getByLabelText(/Effective from/), "2026-12-01");
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("hides salary set-up and bank details from users without the payroll permission", () => {
    render(<Harness canManagePayroll={false} masked={["salary_payment_method", "bank_account_number"]} />);
    expect(screen.getByText(/need the payroll permission/)).toBeTruthy();
    expect(screen.queryByLabelText("Salary structure")).toBeNull();
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
});
