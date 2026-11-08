import { useMemo } from "react";
import type { HrDepartmentResponse, HrDesignationResponse, HrEmployeeResponse, HrSectionResponse } from "@/api/client";
import type { HrQuickAddRecord } from "@/components/hr/HrMasterQuickAddModal";
import { QuickAddSelect } from "@/components/hr/QuickAddSelect";
import { CheckboxField, Section, SelectField, TextField } from "./formControls";
import {
  calculateConfirmationDate,
  EMPLOYMENT_TYPE_SUGGESTIONS,
  type EmployeeFormState,
  type WorkspaceMode,
} from "./employeeWorkspaceLogic";

const CATEGORIES = ["WORKER", "STAFF", "MANAGEMENT"].map((c) => ({ value: c, label: c }));

type Props = {
  mode: WorkspaceMode;
  form: EmployeeFormState;
  setField: <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => void;
  employeeCode: string | null;
  nextCode: string | null;
  departments: HrDepartmentResponse[];
  designations: HrDesignationResponse[];
  sections: HrSectionResponse[];
  managers: HrEmployeeResponse[];
  onMasterCreated: (kind: "department" | "designation" | "section", record: HrQuickAddRecord) => void;
  highlight: ReadonlySet<string>;
  issueTempGatePass: boolean;
  onIssueTempGatePassChange: (value: boolean) => void;
  canManageGatePass: boolean;
};

export function JobTab({
  mode, form, setField, employeeCode, nextCode, departments, designations, sections, managers, onMasterCreated,
  highlight, issueTempGatePass, onIssueTempGatePassChange, canManageGatePass,
}: Props) {
  const departmentOptions = useMemo(() => departments.map((d) => ({ id: d.id, label: `${d.code} - ${d.name}` })), [departments]);
  const designationOptions = useMemo(
    () =>
      designations
        .filter((d) => !form.department_id || !d.department_id || d.department_id === form.department_id)
        .map((d) => ({ id: d.id, label: `${d.code} - ${d.title}` })),
    [designations, form.department_id],
  );
  const sectionOptions = useMemo(() => sections.map((s) => ({ id: s.id, label: `${s.code} - ${s.name} (${s.section_type})` })), [sections]);
  const calculated = calculateConfirmationDate(form.joining_date, form.probation_months);
  const probationError =
    form.probation_months.trim() && !(Number.isInteger(Number(form.probation_months)) && Number(form.probation_months) >= 0 && Number(form.probation_months) <= 24)
      ? "Whole months from 0 to 24"
      : undefined;

  return (
    <div className="space-y-4">
      <Section title="Employment & dates">
        <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm" aria-label="Employee number">
          <span className="font-medium text-text-primary">{employeeCode ?? nextCode ?? "Assigned on save"}</span>
          <span className="block text-xs text-text-muted">
            {employeeCode ? "Permanent employee number, never reused" : "New number on save, never reused"}
          </span>
        </div>
        <TextField
          label="Employment type"
          value={form.employment_type}
          onChange={(v) => setField("employment_type", v)}
          list="employment-type-suggestions"
          hint="Permanent, temporary, contractual or probation (other existing values are kept)"
          highlight={highlight.has("employment_type")}
          maxLength={32}
        />
        <datalist id="employment-type-suggestions">
          {EMPLOYMENT_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <SelectField label="Category" value={form.employee_category} onChange={(v) => setField("employee_category", v)} options={CATEGORIES} />
        <TextField label="Joining date" type="date" value={form.joining_date} onChange={(v) => setField("joining_date", v)} highlight={highlight.has("joining_date")} />
        <TextField
          label="Probation (months)"
          type="number"
          inputMode="numeric"
          value={form.probation_months}
          onChange={(v) => setField("probation_months", v)}
          error={probationError}
          hint={calculated ? `Confirmation on ${calculated}` : "Enter joining date and months to calculate"}
        />
        <div>
          <TextField
            label="Confirmation date"
            type="date"
            value={form.confirmation_date}
            onChange={(v) => setField("confirmation_date", v)}
          />
          {calculated && calculated !== form.confirmation_date && (
            <button
              type="button"
              onClick={() => setField("confirmation_date", calculated)}
              className="mt-1 text-xs font-medium text-brand-primary hover:underline"
            >
              Use {calculated}
            </button>
          )}
        </div>
        {mode === "edit" && <TextField label="Exit date" type="date" value={form.exit_date} onChange={(v) => setField("exit_date", v)} />}
      </Section>

      <Section title="Placement" description="Use + to add a missing department, designation or section without leaving this form.">
        <QuickAddSelect
          kind="department"
          label="Department"
          emptyLabel="No department"
          value={form.department_id}
          options={departmentOptions}
          onChange={(id) => {
            setField("department_id", id);
            setField("designation_id", null);
          }}
          onCreated={(r) => onMasterCreated("department", r)}
        />
        <QuickAddSelect
          kind="designation"
          label="Designation"
          emptyLabel="No designation"
          value={form.designation_id}
          options={designationOptions}
          onChange={(id) => setField("designation_id", id)}
          onCreated={(r) => onMasterCreated("designation", r)}
          defaultDepartmentId={form.department_id}
          departmentOptions={departmentOptions}
        />
        <QuickAddSelect
          kind="section"
          label="Section / line"
          emptyLabel="No section / line"
          value={form.section_id}
          options={sectionOptions}
          onChange={(id) => setField("section_id", id)}
          onCreated={(r) => onMasterCreated("section", r)}
        />
        <SelectField
          label="Reporting manager"
          value={form.reporting_manager_id ? String(form.reporting_manager_id) : ""}
          onChange={(v) => setField("reporting_manager_id", v ? Number(v) : null)}
          options={managers.map((m) => ({ value: String(m.id), label: `${m.employee_code} — ${m.first_name} ${m.last_name ?? ""}`.trim() }))}
          emptyLabel="No reporting manager"
          className="sm:col-span-2"
        />
        <TextField
          label="Device PIN"
          value={form.attendance_device_pin}
          onChange={(v) => setField("attendance_device_pin", v)}
          hint="Attendance machine user number, only if it is not the employee number"
          maxLength={32}
        />
      </Section>

      {mode === "create" && canManageGatePass && (
        <section className="rounded-xl border border-border bg-surface-raised p-4">
          <CheckboxField
            label="Issue a 7-day temporary gate pass"
            hint="Lets the new employee enter on day one, before the ID card is printed. Needs a mobile number."
            checked={issueTempGatePass}
            onChange={onIssueTempGatePassChange}
          />
        </section>
      )}
    </div>
  );
}
