import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type HrCompensationOptions,
  type HrCompensationPreview,
  type HrEmployeeCompensationView,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { CheckboxField, Section, SelectField, TextField } from "./formControls";
import {
  addFacility,
  FACILITY_SUGGESTIONS,
  toggleFacility,
  type EmployeeFormState,
  type SalaryFormState,
  type WorkspaceMode,
} from "./employeeWorkspaceLogic";

type Props = {
  mode: WorkspaceMode;
  canManagePayroll: boolean;
  options: HrCompensationOptions | null;
  salary: SalaryFormState;
  setSalary: (next: SalaryFormState) => void;
  form: EmployeeFormState;
  setField: <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => void;
  masked: ReadonlySet<string>;
  /** Edit mode: current pay + history, and the save action for a new salary window. */
  current?: HrEmployeeCompensationView | null;
  onSaveSalary?: () => void;
  savingSalary?: boolean;
};

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "bkash", label: "bKash" },
  { value: "cash", label: "Cash" },
];

function usePreview(salary: SalaryFormState, joiningDate: string, enabled: boolean) {
  const [preview, setPreview] = useState<HrCompensationPreview | null>(null);
  useEffect(() => {
    if (!enabled || !salary.structure_id) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .previewHrCompensation({
          structure_id: salary.structure_id as number,
          bd_wage_rate_id: salary.bd_wage_rate_id,
          base_salary: salary.base_salary.trim() || null,
          effective_from: salary.effective_from || joiningDate || null,
        })
        .then(setPreview)
        .catch((e) => {
          logApiError("SalaryTab.preview", e);
          setPreview({ minimum_basic: null, minimum_gross: null, basic: null, gross: null, meets_minimum: false, message: e instanceof Error ? e.message : "Preview failed" });
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, salary.structure_id, salary.bd_wage_rate_id, salary.base_salary, salary.effective_from, joiningDate]);
  return preview;
}

export function SalaryTab({ mode, canManagePayroll, options, salary, setSalary, form, setField, masked, current, onSaveSalary, savingSalary }: Props) {
  const preview = usePreview(salary, form.joining_date, canManagePayroll);
  const [customFacility, setCustomFacility] = useState("");
  const grade = options?.wage_grades.find((g) => g.id === salary.bd_wage_rate_id) ?? null;
  const bankMasked = masked.has("bank_account_number");

  return (
    <div className="space-y-4">
      {canManagePayroll ? (
        <>
          {mode === "edit" && current && (
            <Section title="Current salary" description={`As of ${current.snapshot.as_of}`}>
              <div className="text-sm">
                <p className="text-xs text-text-muted">Basic / gross</p>
                <p className="font-semibold text-text-primary">
                  {current.snapshot.basic} / {current.snapshot.gross}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-text-muted">Structure</p>
                <p className="text-text-primary">{current.snapshot.structure_code ?? "None assigned"}</p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-text-muted">Wage grade</p>
                <p className="text-text-primary">{current.snapshot.wage_rate_code ?? "—"}</p>
              </div>
              {current.structure_assignments.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-surface-subtle">
                      <tr>
                        <th className="px-3 py-1.5 text-left uppercase">From</th>
                        <th className="px-3 py-1.5 text-left uppercase">To</th>
                        <th className="px-3 py-1.5 text-left uppercase">Structure</th>
                        <th className="px-3 py-1.5 text-right uppercase">Basic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.structure_assignments.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="px-3 py-1.5">{a.effective_from}</td>
                          <td className="px-3 py-1.5">{a.effective_to ?? "Open"}</td>
                          <td className="px-3 py-1.5">{a.structure_code}</td>
                          <td className="px-3 py-1.5 text-right">{a.base_salary ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          <Section
            title={mode === "edit" ? "Change salary" : "Salary set-up"}
            description={
              mode === "edit"
                ? "A change starts a new period from the effective date; the earlier period closes the day before."
                : "Optional. Choose a salary structure to set pay now, or leave empty and set it later."
            }
          >
            <SelectField
              label="Salary structure"
              value={salary.structure_id ? String(salary.structure_id) : ""}
              onChange={(v) => setSalary({ ...salary, structure_id: v ? Number(v) : null })}
              options={(options?.structures ?? []).map((s) => ({ value: String(s.id), label: `${s.code} - ${s.name}` }))}
              emptyLabel="No salary set-up yet"
            />
            <SelectField
              label="Bangladesh wage grade"
              value={salary.bd_wage_rate_id ? String(salary.bd_wage_rate_id) : ""}
              onChange={(v) => setSalary({ ...salary, bd_wage_rate_id: v ? Number(v) : null })}
              options={(options?.wage_grades ?? []).map((g) => ({ value: String(g.id), label: `${g.rate_code} (basic ${g.basic}, gross ${g.gross})` }))}
              emptyLabel="No grade"
              hint="The grade is the legal minimum; salary below it is refused."
            />
            <TextField
              label="Basic salary"
              value={salary.base_salary}
              onChange={(v) => setSalary({ ...salary, base_salary: v })}
              inputMode="numeric"
              placeholder={grade ? `Grade minimum ${grade.basic}` : "e.g. 12500"}
              hint={grade ? "Leave empty to use the grade minimum basic" : undefined}
            />
            <TextField
              label={mode === "edit" ? "Effective from *" : "Effective from"}
              type="date"
              value={salary.effective_from}
              onChange={(v) => setSalary({ ...salary, effective_from: v })}
              hint={mode === "create" ? "Defaults to the joining date" : undefined}
            />
            {preview && (
              <div
                className={`sm:col-span-2 rounded-lg border px-3 py-2 text-sm ${
                  preview.meets_minimum
                    ? "border-status-success/30 bg-status-success-subtle text-status-success-foreground"
                    : "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
                }`}
                role="status"
              >
                {preview.basic && (
                  <p>
                    Basic {preview.basic} · Gross {preview.gross}
                  </p>
                )}
                {preview.minimum_basic && (
                  <p className="text-xs">
                    Legal minimum: basic {preview.minimum_basic}, gross {preview.minimum_gross}
                  </p>
                )}
                {!preview.meets_minimum && preview.message && <p className="text-xs font-medium">{preview.message}</p>}
              </div>
            )}
            {mode === "edit" && onSaveSalary && (
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <button
                  type="button"
                  onClick={onSaveSalary}
                  disabled={savingSalary || !salary.structure_id || !salary.effective_from || (preview !== null && !preview.meets_minimum)}
                  className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingSalary ? "Saving..." : "Save new salary"}
                </button>
              </div>
            )}
          </Section>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-text-secondary">
          Salary set-up and bank details need the payroll permission (<code>hr.payroll.manage</code>). Ask a manager to complete them.
        </div>
      )}

      <Section title="Payment" description="How the salary is paid. Bank details are optional.">
        <SelectField
          label="Salary paid by"
          value={form.salary_payment_method}
          onChange={(v) => setField("salary_payment_method", v as EmployeeFormState["salary_payment_method"])}
          options={PAYMENT_METHODS}
          masked={masked.has("salary_payment_method")}
          disabled={!canManagePayroll}
        />
        {form.salary_payment_method === "bkash" && (
          <p className="self-end text-xs text-text-muted">
            bKash number: {form.phone || "add the mobile on the Personal tab"}
            {form.phone && !form.mobile_is_bkash ? " (tick “This mobile is a bKash number”)" : ""}
          </p>
        )}
        {(["bank_account_name", "bank_account_number", "bank_name", "bank_branch", "bank_routing_no"] as const).map((key) => (
          <TextField
            key={key}
            label={
              { bank_account_name: "Account name", bank_account_number: "Account number", bank_name: "Bank", bank_branch: "Branch", bank_routing_no: "Routing number" }[key]
            }
            value={form[key]}
            onChange={(v) => setField(key, v)}
            masked={bankMasked}
            disabled={!canManagePayroll}
            inputMode={key === "bank_account_number" || key === "bank_routing_no" ? "numeric" : undefined}
          />
        ))}
      </Section>

      <Section title="Facilities" description="Printed on the appointment letter.">
        <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...FACILITY_SUGGESTIONS, ...form.facilities.filter((f) => !(FACILITY_SUGGESTIONS as readonly string[]).includes(f))].map((name) => (
            <CheckboxField key={name} label={name} checked={form.facilities.includes(name)} onChange={() => setField("facilities", toggleFacility(form.facilities, name))} />
          ))}
        </div>
        <div className="sm:col-span-2 flex items-end gap-2">
          <TextField label="Other facility" value={customFacility} onChange={setCustomFacility} maxLength={64} className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setField("facilities", addFacility(form.facilities, customFacility));
              setCustomFacility("");
            }}
            disabled={!customFacility.trim()}
            className="rounded border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </Section>

      <p className="text-xs text-text-muted">
        Full payroll screens:{" "}
        <Link className="text-brand-primary hover:underline" to="/app/hr/payroll/salary-structures">
          Salary structures
        </Link>{" "}
        ·{" "}
        <Link className="text-brand-primary hover:underline" to="/app/hr/payroll/assignments">
          Structure assignments
        </Link>{" "}
        ·{" "}
        <Link className="text-brand-primary hover:underline" to="/app/hr/payroll/payslips">
          Payslips
        </Link>
      </p>
    </div>
  );
}
