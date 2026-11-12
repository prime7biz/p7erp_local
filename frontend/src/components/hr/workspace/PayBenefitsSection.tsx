/**
 * Overtime and company bills for one employee (Employment & Salary tab).
 * Each switch is on by default (the same as an employee with no saved switches). Bills can carry an
 * own amount per qualifying day; overtime is priced from the salary, so it has no amount box.
 */
import { Link } from "react-router-dom";
import type { HrBillRule, HrBillType } from "@/api/client";
import { CheckboxField, Section } from "./formControls";
import {
  normalizeMoney,
  PAY_BENEFIT_CODES,
  PAY_BENEFIT_LABELS,
  type PayBenefitsState,
  type WorkspaceMode,
} from "./employeeWorkspaceLogic";
import type { SalaryStatus } from "./SalaryTab";

type Props = {
  mode: WorkspaceMode;
  value: PayBenefitsState;
  onChange: (next: PayBenefitsState) => void;
  billRules: readonly HrBillRule[];
  blocker: string | null;
  dirty: boolean;
  onSave?: () => void;
  saving?: boolean;
  status?: SalaryStatus;
};

const HINTS: Record<string, string> = {
  OVERTIME: "When on, approved overtime is paid from the salary. When off, overtime cannot be entered or approved and payroll pays none.",
  FRIDAY: "Paid for each day the employee works on the weekly holiday (Friday by default).",
  TIFFIN: "Paid on the days the company tiffin rule applies.",
  LUNCH: "Paid on the days the company lunch rule applies.",
  DINNER: "Paid on the days the company dinner rule applies.",
  NIGHT: "Paid on the days the company night-bill rule applies.",
};

function companyRate(rules: readonly HrBillRule[], billType: HrBillType): string | null {
  const amounts = rules.filter((r) => r.bill_type === billType && r.amount).map((r) => normalizeMoney(r.amount));
  if (amounts.length === 0) return null;
  return Array.from(new Set(amounts)).join(" / ");
}

export function PayBenefitsSection({ mode, value, onChange, billRules, blocker, dirty, onSave, saving, status }: Props) {
  const set = (code: keyof PayBenefitsState, patch: Partial<PayBenefitsState[keyof PayBenefitsState]>) =>
    onChange({ ...value, [code]: { ...value[code], ...patch } });

  return (
    <Section
      title="Overtime & allowances"
      description="Choose what this employee gets. Bill amounts come from the company rules unless you type an own amount."
    >
      <div className="sm:col-span-2 lg:col-span-3 divide-y divide-border rounded-lg border border-border">
        {PAY_BENEFIT_CODES.map((code) => {
          const row = value[code];
          const rate = code === "OVERTIME" ? null : companyRate(billRules, code as HrBillType);
          return (
            <div key={code} className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-center">
              <div>
                <CheckboxField
                  label={PAY_BENEFIT_LABELS[code]}
                  checked={row.enabled}
                  onChange={(v) => set(code, { enabled: v })}
                  hint={HINTS[code]}
                />
                {code !== "OVERTIME" && (
                  <p className="ml-6 mt-0.5 text-xs text-text-muted">
                    {rate ? (
                      `Company rate: ${rate} per day`
                    ) : (
                      <>
                        No approved company rule yet.{" "}
                        <Link className="text-brand-primary hover:underline" to="/app/hr/payroll-extras?tab=allowances">
                          Add one under Allowances &amp; bonuses
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
              {code !== "OVERTIME" && row.enabled && (
                <label className="text-xs text-text-muted">
                  Own amount per day (optional)
                  <input
                    aria-label={`${PAY_BENEFIT_LABELS[code]} own amount`}
                    className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
                    inputMode="numeric"
                    placeholder={rate ? `Company ${rate}` : "e.g. 50"}
                    value={row.amount}
                    onChange={(e) => set(code, { amount: e.target.value })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {blocker && (
        <p className="sm:col-span-2 lg:col-span-3 text-xs font-medium text-status-warning-foreground" role="status">
          {blocker}
        </p>
      )}
      {mode === "edit" && onSave && (
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty || blocker !== null}
            className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save overtime & allowances"}
          </button>
        </div>
      )}
      {status && (
        <div
          className={`sm:col-span-2 lg:col-span-3 rounded-lg border px-3 py-2 text-sm ${
            status.kind === "success"
              ? "border-status-success/30 bg-status-success-subtle text-status-success-foreground"
              : "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
          }`}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </div>
      )}
    </Section>
  );
}
