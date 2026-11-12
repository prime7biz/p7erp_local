import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  HrCompensationComponent,
  HrCompensationOptions,
  HrEmployeeCompensationView,
  HrSalaryChangeType,
} from "@/api/client";
import { CheckboxField, Section, SelectField, TextField } from "./formControls";
import {
  addFacility,
  buildComponentRows,
  componentRowsGross,
  componentRuleLabel,
  FACILITY_SUGGESTIONS,
  incrementPatch,
  isMoneyInput,
  normalizeMoney,
  salaryNeedsAmount,
  toggleFacility,
  type ComponentRowView,
  type EmployeeFormState,
  type PayBenefitsState,
  type SalaryDateSource,
  type SalaryFormState,
  type SalaryPreviewState,
  type WorkspaceMode,
} from "./employeeWorkspaceLogic";
import { PayBenefitsSection } from "./PayBenefitsSection";
import { SalaryTdsCard, TdsEstimateBox } from "./SalaryTdsCard";

export type SalaryStatus = { kind: "success" | "error"; text: string } | null;

type Props = {
  mode: WorkspaceMode;
  canManagePayroll: boolean;
  options: HrCompensationOptions | null;
  salary: SalaryFormState;
  onSalaryChange: (patch: Partial<SalaryFormState>) => void;
  preview: SalaryPreviewState;
  effective: { date: string; source: SalaryDateSource };
  /** Why the salary cannot be saved yet (null = ready). */
  blocker: string | null;
  form: EmployeeFormState;
  setField: <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => void;
  masked: ReadonlySet<string>;
  /** Edit mode: current pay + history, the change form and its own save. */
  current?: HrEmployeeCompensationView | null;
  onStartChange?: () => void;
  onCancelChange?: () => void;
  onSaveSalary?: () => void;
  savingSalary?: boolean;
  salaryStatus?: SalaryStatus;
  /** Overtime + bill switches (payroll permission only). */
  payBenefits?: PayBenefitsState;
  onPayBenefitsChange?: (next: PayBenefitsState) => void;
  payBenefitsBlocker?: string | null;
  onSavePayBenefits?: () => void;
  savingPayBenefits?: boolean;
  payBenefitsStatus?: SalaryStatus;
  payBenefitsDirty?: boolean;
  /** Edit mode: saved employee id, and a reload of the current salary after the tax profile changed. */
  employeeId?: number;
  onTaxProfileSaved?: () => void;
};

const CHANGE_TYPES: { value: HrSalaryChangeType; label: string }[] = [
  { value: "INCREMENT", label: "Increment" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "CORRECTION", label: "Correction (fix a mistake)" },
];

const CHANGE_HINTS: Record<HrSalaryChangeType, string> = {
  INCREMENT: "A raise from a later date. The new basic is calculated below and you can still change it.",
  PROMOTION: "New grade or structure from a later date.",
  CORRECTION: "Fixes a wrong salary. Use the current start date to correct it in place (only before payroll is run for it).",
};

function ComponentTable({
  rows,
  gross,
  overrides,
  onOverride,
}: {
  rows: ComponentRowView[];
  gross: string | null;
  overrides: Readonly<Record<string, string>>;
  onOverride: (code: string, value: string | null) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="sm:col-span-2 lg:col-span-3 text-xs text-text-muted">
        This structure has no active components yet. Add them under Payroll → Salary structures.
      </p>
    );
  }
  return (
    <div className="sm:col-span-2 lg:col-span-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-subtle text-xs text-text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Component</th>
            <th className="px-3 py-2 text-left font-medium">Rule</th>
            <th className="px-3 py-2 text-right font-medium">Standard</th>
            <th className="px-3 py-2 text-right font-medium">This employee (per month)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-border">
              <td className="px-3 py-2">
                <span className="font-medium text-text-primary">{r.name}</span>
                {r.deduction && <span className="ml-2 rounded bg-surface-subtle px-1.5 py-0.5 text-[11px] text-text-muted">Deduction</span>}
              </td>
              <td className="px-3 py-2 text-xs text-text-muted">{r.rule}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.standard ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                {r.kind === "editable" ? (
                  <div className="flex items-center justify-end gap-2">
                    <input
                      aria-label={`${r.name} amount for this employee`}
                      className="w-28 rounded border border-border-strong bg-surface-raised px-2 py-1 text-right text-sm tabular-nums"
                      inputMode="numeric"
                      placeholder={r.standard ?? ""}
                      value={overrides[r.code] ?? ""}
                      onChange={(e) => onOverride(r.code, e.target.value)}
                    />
                    {r.overridden && (
                      <button type="button" className="text-xs text-brand-primary hover:underline" onClick={() => onOverride(r.code, null)}>
                        Reset
                      </button>
                    )}
                  </div>
                ) : r.kind === "basic" ? (
                  <span className="tabular-nums text-text-primary" title="Change the basic salary above">
                    {r.value ?? "—"} <span className="text-xs text-text-muted">(basic)</span>
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">{r.value ?? "Calculated in payroll"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-surface-subtle">
            <td className="px-3 py-2 text-sm font-semibold text-text-primary" colSpan={3}>
              Monthly gross
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{gross ?? "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The salary in force, line by line (read-only). */
function CurrentComponents({ components, gross }: { components: HrCompensationComponent[]; gross: string }) {
  const earnings = components.filter((c) => c.component_type !== "DEDUCTION");
  const deductions = components.filter((c) => c.component_type === "DEDUCTION");
  const row = (c: HrCompensationComponent) => (
    <tr key={c.code} className="border-t border-border">
      <td className="px-3 py-1.5">
        <span className="text-text-primary">{c.name}</span>
        {c.overridden && (
          <span className="ml-2 rounded bg-status-warning-subtle px-1.5 py-0.5 text-[11px] text-text-secondary">Own amount</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-text-muted">{componentRuleLabel(c.calculation_type, c.rule_amount)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-text-primary">
        {c.amount !== null ? normalizeMoney(c.amount) : <span className="text-text-muted">Calculated in payroll</span>}
        {c.overridden && c.standard_amount !== null && (
          <span className="block text-[11px] text-text-muted">Standard {normalizeMoney(c.standard_amount)}</span>
        )}
      </td>
    </tr>
  );
  return (
    <div className="sm:col-span-2 lg:col-span-3 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-xs">
        <thead className="bg-surface-subtle">
          <tr>
            <th className="px-3 py-1.5 text-left uppercase">Component</th>
            <th className="px-3 py-1.5 text-left uppercase">Rule</th>
            <th className="px-3 py-1.5 text-right uppercase">Per month</th>
          </tr>
        </thead>
        <tbody>{earnings.map(row)}</tbody>
        <tbody>
          <tr className="border-t border-border bg-surface-subtle font-semibold">
            <td className="px-3 py-1.5 text-text-primary" colSpan={2}>
              Gross salary
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-text-primary">{normalizeMoney(gross)}</td>
          </tr>
        </tbody>
        {deductions.length > 0 && (
          <tbody>
            <tr className="border-t border-border">
              <td className="px-3 pt-2 text-[11px] font-semibold uppercase text-text-muted" colSpan={3}>
                Deductions
              </td>
            </tr>
            {deductions.map(row)}
          </tbody>
        )}
      </table>
    </div>
  );
}

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "bkash", label: "bKash" },
  { value: "cash", label: "Cash" },
];

function dateHint(mode: WorkspaceMode, effective: Props["effective"]): string {
  if (mode === "edit") return "The current salary period ends the day before this date.";
  if (effective.source === "joining") return "Taken from the joining date. Type another date to change it.";
  if (effective.source === "company_today") return `No joining date yet, so the salary starts today (${effective.date}). Enter a date to change it.`;
  if (effective.source === "missing") return "Enter a joining date on this tab or a salary start date.";
  return "";
}

function PreviewBox({ preview }: { preview: SalaryPreviewState }) {
  if (preview.status === "idle") return null;
  if (preview.status === "pending") {
    return (
      <div className="sm:col-span-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary" role="status">
        Checking the salary…
      </div>
    );
  }
  if (preview.status === "error") {
    return (
      <div className="sm:col-span-2 rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground" role="status">
        Could not check the salary: {preview.message}
      </div>
    );
  }
  const p = preview.preview;
  const ok = preview.status === "valid";
  return (
    <div
      className={`sm:col-span-2 rounded-lg border px-3 py-2 text-sm ${
        ok ? "border-status-success/30 bg-status-success-subtle text-status-success-foreground" : "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
      }`}
      role="status"
    >
      {p?.basic && (
        <p>
          Basic {normalizeMoney(p.basic)} · Gross {normalizeMoney(p.gross)}
        </p>
      )}
      {p?.minimum_basic && (
        <p className="text-xs">
          Legal minimum: basic {normalizeMoney(p.minimum_basic)}, gross {normalizeMoney(p.minimum_gross)}
        </p>
      )}
      {!ok && preview.message && <p className="text-xs font-medium">{preview.message}</p>}
    </div>
  );
}

export function SalaryTab({
  mode, canManagePayroll, options, salary, onSalaryChange, preview, effective, blocker, form, setField, masked,
  current, onStartChange, onCancelChange, onSaveSalary, savingSalary, salaryStatus,
  payBenefits, onPayBenefitsChange, payBenefitsBlocker, onSavePayBenefits, savingPayBenefits, payBenefitsStatus,
  payBenefitsDirty, employeeId, onTaxProfileSaved,
}: Props) {
  const [customFacility, setCustomFacility] = useState("");
  const grades = options?.wage_grades ?? [];
  const grade = grades.find((g) => g.id === salary.bd_wage_rate_id) ?? null;
  const snapshot = current?.snapshot ?? null;
  const bankMasked = masked.has("bank_account_number");
  // The grade in force cannot be removed here (an empty grade keeps it), so edit offers no empty choice.
  const keepsGrade = mode === "edit" && snapshot?.wage_rate_id != null;
  const gradeFromStructure = keepsGrade && snapshot?.wage_assignment_id == null && salary.bd_wage_rate_id === snapshot?.wage_rate_id;

  const structureOptions = (options?.structures ?? []).map((s) => ({ value: String(s.id), label: `${s.code} - ${s.name}` }));
  if (snapshot?.structure_id != null && !structureOptions.some((o) => o.value === String(snapshot.structure_id))) {
    structureOptions.unshift({ value: String(snapshot.structure_id), label: `${snapshot.structure_code ?? "Current"} (current)` });
  }
  const gradeOptions = grades.map((g) => ({ value: String(g.id), label: `${g.rate_code} (basic ${normalizeMoney(g.basic)}, gross ${normalizeMoney(g.gross)})` }));
  if (snapshot?.wage_rate_id != null && !gradeOptions.some((o) => o.value === String(snapshot.wage_rate_id))) {
    gradeOptions.unshift({ value: String(snapshot.wage_rate_id), label: `${snapshot.wage_rate_code ?? "Current"} (current)` });
  }
  const standardBasic = grade?.basic ?? (snapshot?.wage_rate_id === salary.bd_wage_rate_id ? snapshot?.wage_grade_basic : null) ?? null;
  const gradeGross = grade?.gross ?? (snapshot?.wage_rate_id === salary.bd_wage_rate_id ? snapshot?.wage_grade_gross : null) ?? null;
  const showForm = salary.enabled;

  const structureLines = options?.structures.find((s) => s.id === salary.structure_id)?.lines ?? [];
  const effectiveBasic = salaryNeedsAmount(salary) ? salary.base_salary.trim() : normalizeMoney(standardBasic ?? "");
  const componentRows = buildComponentRows(structureLines, effectiveBasic, salary.component_overrides);
  const previewGross = preview.status === "valid" || preview.status === "invalid" ? preview.preview?.gross ?? null : null;
  const tableGross = previewGross ? normalizeMoney(previewGross) : componentRowsGross(componentRows);
  const setOverride = (code: string, value: string | null) => {
    const next = { ...salary.component_overrides };
    if (value === null) delete next[code];
    else next[code] = value;
    onSalaryChange({ component_overrides: next });
  };

  const currentBasic = snapshot ? normalizeMoney(snapshot.basic) : "";
  const defaultIncrementPct = normalizeMoney(grade?.annual_increment_pct ?? options?.annual_increment_pct ?? "5");
  const changeIncrement = (patch: Partial<Pick<SalaryFormState, "increment_mode" | "increment_value">>) =>
    onSalaryChange(incrementPatch(salary, currentBasic, patch));
  const shownDate = salary.effective_from || (mode === "create" ? effective.date : "");

  const statusBox = salaryStatus && (
    <div
      className={`sm:col-span-2 lg:col-span-3 rounded-lg border px-3 py-2 text-sm ${
        salaryStatus.kind === "success"
          ? "border-status-success/30 bg-status-success-subtle text-status-success-foreground"
          : "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
      }`}
      role={salaryStatus.kind === "error" ? "alert" : "status"}
    >
      {salaryStatus.text}
    </div>
  );

  return (
    <div className="space-y-4">
      {canManagePayroll ? (
        <>
          {mode === "edit" && (
            <Section title="Current salary" description={snapshot ? `As of ${snapshot.as_of}` : "Loading…"}>
              {snapshot && (
                <>
                  <div className="text-sm">
                    <p className="text-xs text-text-muted">Basic / gross</p>
                    <p className="font-semibold text-text-primary">
                      {normalizeMoney(snapshot.basic)} / {normalizeMoney(snapshot.gross)}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-text-muted">Structure</p>
                    <p className="text-text-primary">{snapshot.structure_code ?? "None assigned"}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-text-muted">Wage grade</p>
                    <p className="text-text-primary">{snapshot.wage_rate_code ?? "—"}</p>
                  </div>
                  {(snapshot.components ?? []).length > 0 && (
                    <CurrentComponents components={snapshot.components ?? []} gross={snapshot.gross} />
                  )}
                </>
              )}
              {employeeId != null && (current?.tds_estimate || canManagePayroll) && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <SalaryTdsCard employeeId={employeeId} estimate={current?.tds_estimate} canManage={canManagePayroll} onSaved={() => onTaxProfileSaved?.()} />
                </div>
              )}
              {current && current.structure_assignments.length > 0 && (
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
                          <td className="px-3 py-1.5 text-right">{a.base_salary ? normalizeMoney(a.base_salary) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!showForm && onStartChange && (
                <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                  <button
                    type="button"
                    onClick={onStartChange}
                    disabled={!current || !options}
                    title={!current || !options ? "Waiting for the current salary to load" : undefined}
                    className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                  >
                    Change salary
                  </button>
                </div>
              )}
              {!showForm && statusBox}
            </Section>
          )}

          {(mode === "create" || showForm) && (
            <Section
              title={mode === "edit" ? "Change salary" : "Salary set-up"}
              description={
                mode === "edit"
                  ? "Starts a new salary period from the date you choose; earlier periods are kept as history."
                  : "Choose a salary structure now, or leave this off and set the salary later from the profile."
              }
            >
              {mode === "create" && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <CheckboxField
                    label="Set salary now"
                    hint="When ticked, the salary must be complete and valid before the employee can be created."
                    checked={salary.enabled}
                    onChange={(v) => onSalaryChange({ enabled: v })}
                  />
                </div>
              )}
              {showForm && (
                <>
                  {mode === "edit" && (
                    <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-subtle p-3 sm:grid-cols-2 lg:grid-cols-3">
                      <SelectField
                        label="Type of change *"
                        value={salary.change_type ?? "INCREMENT"}
                        onChange={(v) => onSalaryChange({ change_type: (v || "INCREMENT") as HrSalaryChangeType })}
                        options={CHANGE_TYPES}
                        allowEmpty={false}
                        hint={CHANGE_HINTS[salary.change_type ?? "INCREMENT"]}
                      />
                      {(salary.change_type ?? "INCREMENT") === "INCREMENT" && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-text-muted">Increment</p>
                          <div className="flex gap-2">
                            <select
                              aria-label="Increment type"
                              className="rounded border border-border-strong bg-surface-raised px-2 py-2 text-sm"
                              value={salary.increment_mode}
                              onChange={(e) => changeIncrement({ increment_mode: e.target.value as "percent" | "amount" })}
                            >
                              <option value="percent">% of basic</option>
                              <option value="amount">Taka</option>
                            </select>
                            <input
                              aria-label="Increment value"
                              className="w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm"
                              inputMode="numeric"
                              placeholder={salary.increment_mode === "percent" ? defaultIncrementPct : "e.g. 500"}
                              value={salary.increment_value}
                              onChange={(e) => changeIncrement({ increment_value: e.target.value })}
                            />
                          </div>
                          <p className="mt-1 text-xs text-text-muted">
                            Current basic {currentBasic || "—"}.{" "}
                            <button
                              type="button"
                              className="text-brand-primary hover:underline"
                              onClick={() => changeIncrement({ increment_mode: "percent", increment_value: defaultIncrementPct })}
                            >
                              Use the annual increment ({defaultIncrementPct}%)
                            </button>
                          </p>
                          {salary.increment_value.trim() !== "" && !isMoneyInput(salary.increment_value) && (
                            <p className="mt-1 text-xs text-status-danger">Type a number such as 5 or 500.</p>
                          )}
                        </div>
                      )}
                      <TextField
                        label="Note (optional)"
                        value={salary.change_note}
                        onChange={(v) => onSalaryChange({ change_note: v })}
                        maxLength={2000}
                        placeholder="e.g. Annual increment 2026"
                      />
                    </div>
                  )}
                  <SelectField
                    label="Salary structure *"
                    value={salary.structure_id ? String(salary.structure_id) : ""}
                    onChange={(v) => onSalaryChange({ structure_id: v ? Number(v) : null })}
                    options={structureOptions}
                    emptyLabel="Choose a structure"
                    hint={
                      !options
                        ? "Salary options did not load. Reload the page to try again."
                        : structureOptions.length === 0
                          ? "No active salary structures yet. Add one under Payroll → Salary structures."
                          : "How the pay is split (basic, house rent, allowances)."
                    }
                  />
                  <SelectField
                    label="Bangladesh wage grade"
                    value={salary.bd_wage_rate_id ? String(salary.bd_wage_rate_id) : ""}
                    onChange={(v) => onSalaryChange({ bd_wage_rate_id: v ? Number(v) : null })}
                    options={gradeOptions}
                    emptyLabel="No grade (type the basic salary)"
                    allowEmpty={!keepsGrade}
                    hint={
                      gradeFromStructure
                        ? "The legal minimum pay, taken from the current salary structure. Saving records it as this employee's grade."
                        : "The legal minimum pay. A salary below it is refused."
                    }
                  />
                  <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-text-muted">Legal minimum</p>
                    {salary.bd_wage_rate_id !== null && (standardBasic || gradeGross) ? (
                      <p className="mt-1 text-text-primary">
                        Basic <span className="font-semibold">{normalizeMoney(standardBasic ?? "") || "—"}</span> · Gross{" "}
                        <span className="font-semibold">{normalizeMoney(gradeGross ?? "") || "—"}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-text-muted">No wage grade chosen, so no legal minimum is checked.</p>
                    )}
                  </div>
                  {salary.bd_wage_rate_id !== null ? (
                    <div className="text-sm">
                      <p className="text-xs font-medium text-text-muted">Standard basic salary</p>
                      <p className="mt-1 font-semibold text-text-primary">
                        {standardBasic ? `${normalizeMoney(standardBasic)} (grade minimum)` : "Grade minimum"}
                      </p>
                      <div className="mt-2">
                        <CheckboxField
                          label="Override standard basic salary"
                          checked={salary.override}
                          onChange={(v) => onSalaryChange({ override: v })}
                        />
                      </div>
                    </div>
                  ) : (
                    <TextField
                      label="Basic salary"
                      required
                      value={salary.base_salary}
                      onChange={(v) => onSalaryChange({ base_salary: v })}
                      inputMode="numeric"
                      placeholder="e.g. 12500"
                      hint="No grade is chosen, so type this employee's basic salary."
                    />
                  )}
                  {salary.bd_wage_rate_id !== null && salary.override && (
                    <>
                      <TextField
                        label="Employee basic salary"
                        required
                        value={salary.base_salary}
                        onChange={(v) => onSalaryChange({ base_salary: v })}
                        inputMode="numeric"
                        placeholder={standardBasic ? `Grade standard ${normalizeMoney(standardBasic)}` : "e.g. 15000"}
                        hint="Must not be below the grade minimum."
                      />
                      <div className="sm:col-span-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-text-secondary">
                        <p className="font-medium text-text-primary">This replaces the grade's standard basic salary for this employee.</p>
                        <div className="mt-2">
                          <CheckboxField
                            label="I confirm this employee's basic salary is different from the grade standard."
                            checked={salary.acknowledged}
                            onChange={(v) => onSalaryChange({ acknowledged: v })}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {salary.structure_id !== null && (
                    <ComponentTable rows={componentRows} gross={tableGross} overrides={salary.component_overrides} onOverride={setOverride} />
                  )}
                  <TextField
                    label={mode === "edit" ? "New salary starts on" : "Salary starts on"}
                    required={mode === "edit"}
                    type="date"
                    value={shownDate}
                    onChange={(v) => onSalaryChange({ effective_from: v })}
                    hint={dateHint(mode, effective)}
                  />
                  <PreviewBox preview={preview} />
                  <TdsEstimateBox estimate={preview.preview?.tds_estimate} title="Income tax (TDS) for this salary" />
                  {blocker && preview.status !== "pending" && (
                    <p className="sm:col-span-2 lg:col-span-3 text-xs font-medium text-status-warning-foreground" role="status">
                      {mode === "create" ? "Before you can create the employee: " : "Before you can save: "}
                      {blocker}
                    </p>
                  )}
                  {mode === "edit" && (
                    <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={onCancelChange}
                        disabled={savingSalary}
                        className="rounded border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSaveSalary}
                        disabled={savingSalary || blocker !== null}
                        className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {savingSalary ? "Saving..." : "Save new salary"}
                      </button>
                    </div>
                  )}
                  {statusBox}
                </>
              )}
            </Section>
          )}
          {payBenefits && onPayBenefitsChange && (
            <PayBenefitsSection
              mode={mode}
              value={payBenefits}
              onChange={onPayBenefitsChange}
              billRules={options?.bill_rules ?? []}
              blocker={payBenefitsBlocker ?? null}
              dirty={payBenefitsDirty ?? false}
              onSave={onSavePayBenefits}
              saving={savingPayBenefits}
              status={payBenefitsStatus}
            />
          )}
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

      <Section title="Facilities" description="Printed on the appointment letter." collapsibleOnPhone>
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
        <Link className="text-brand-primary hover:underline" to="/app/hr/leave-payroll-setup?tab=structures">
          Salary structures
        </Link>{" "}
        ·{" "}
        <Link className="text-brand-primary hover:underline" to="/app/hr/payroll?tab=payslips">
          Payslips
        </Link>
      </p>
    </div>
  );
}

