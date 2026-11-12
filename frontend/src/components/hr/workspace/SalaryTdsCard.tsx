import { useEffect, useState } from "react";
import { api, type HrEmployeeTaxProfile, type HrTdsEstimate } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { CheckboxField, Section, SelectField, TextField } from "./formControls";
import { isMoneyInput, normalizeMoney } from "./employeeWorkspaceLogic";

const CATEGORY_OPTIONS = [
  { value: "AUTO", label: "Automatic (from gender and birth date)" },
  { value: "GENERAL", label: "General" },
  { value: "FEMALE", label: "Female" },
  { value: "SENIOR_65", label: "Age 65 or more" },
  { value: "DISABLED", label: "Person with disability" },
  { value: "THIRD_GENDER", label: "Third gender" },
  { value: "FREEDOM_FIGHTER", label: "Freedom fighter" },
];

const REBATE_OPTIONS = [
  { value: "NONE", label: "No rebate" },
  { value: "DECLARED_INVESTMENT", label: "Rebate from declared investment" },
];

/** Shown beside the current salary. A salary-only estimate; payroll uses the full-year projection. */
export function TdsEstimateBox({ estimate, title = "Income tax (TDS) estimate" }: { estimate: HrTdsEstimate | null | undefined; title?: string }) {
  if (!estimate) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-3 text-sm space-y-1" data-testid="tds-estimate">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="text-xs text-text-muted">Salary-only estimate (12 months of this gross). Payroll projects the whole July–June year.</p>
      {!estimate.supported ? (
        <p className="text-status-warning-foreground">{estimate.message ?? "Tax rates are not available for this year."}</p>
      ) : !estimate.employee_tds_enabled ? (
        <p className="text-text-primary">Tax deduction is switched off for this employee.</p>
      ) : (
        <>
          <p className="text-text-primary">
            Monthly tax: <span className="font-semibold">{normalizeMoney(estimate.monthly_tds ?? "0")}</span>
          </p>
          <p className="text-text-primary">
            Estimated net pay: <span className="font-semibold">{normalizeMoney(estimate.estimated_net_monthly ?? "0")}</span>
          </p>
          {estimate.category && <p className="text-xs text-text-muted">Tax category: {estimate.category}</p>}
        </>
      )}
      {!estimate.payroll_enabled && (
        <p className="text-xs text-text-muted">Payroll does not deduct this tax yet (switch it on in Settings → Configuration).</p>
      )}
      {(estimate.warnings ?? []).map((w) => (
        <p key={w} className="text-xs text-status-warning-foreground">{w}</p>
      ))}
    </div>
  );
}

type Props = {
  employeeId: number;
  estimate: HrTdsEstimate | null | undefined;
  canManage: boolean;
  /** Called after the profile was saved so the estimate can be reloaded. */
  onSaved: () => void;
};

export function SalaryTdsCard({ employeeId, estimate, canManage, onSaved }: Props) {
  const [profile, setProfile] = useState<HrEmployeeTaxProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let live = true;
    api
      .getHrEmployeeTaxProfile(employeeId)
      .then((r) => live && setProfile(r.profile))
      .catch((e) => logApiError("SalaryTdsCard.load", e));
    return () => {
      live = false;
    };
  }, [employeeId, canManage]);

  const patch = (p: Partial<HrEmployeeTaxProfile>) => {
    setStatus(null);
    setProfile((prev) => (prev ? { ...prev, ...p } : prev));
  };

  const moneyError = (v: string | null) => (v && !isMoneyInput(v) ? "Enter a number" : undefined);
  const invalid =
    !!profile &&
    [profile.declared_annual_investment, profile.monthly_tds_override, profile.opening_ytd_gross, profile.opening_ytd_tds].some(
      (v) => !!moneyError(v),
    );

  const save = async () => {
    if (!profile || invalid) return;
    setSaving(true);
    setStatus(null);
    try {
      const { exists: _exists, ...body } = profile;
      void _exists;
      const saved = await api.saveHrEmployeeTaxProfile(employeeId, body);
      setProfile(saved.profile);
      setStatus({ kind: "success", text: "Tax profile saved." });
      onSaved();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Could not save the tax profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <TdsEstimateBox estimate={estimate} />
      {canManage && profile && (
        <Section title="Tax profile" description="Used by payroll for income tax deducted at source." collapsibleOnPhone>
          <CheckboxField label="Deduct income tax (TDS) for this employee" checked={profile.tds_enabled} onChange={(v) => patch({ tds_enabled: v })} />
          <TextField label="TIN" value={profile.tin_number ?? ""} onChange={(v) => patch({ tin_number: v || null })} maxLength={32} />
          <SelectField
            label="Tax category"
            value={profile.tax_category_override}
            onChange={(v) => patch({ tax_category_override: v })}
            options={CATEGORY_OPTIONS}
            allowEmpty={false}
            hint="Missing gender or birth date uses the General threshold."
          />
          {profile.tax_category_override !== "AUTO" && profile.tax_category_override !== "GENERAL" && (
            <TextField
              label="Evidence reference"
              value={profile.category_evidence_reference ?? ""}
              onChange={(v) => patch({ category_evidence_reference: v || null })}
              hint="Certificate or document number that proves this category."
              maxLength={255}
            />
          )}
          <SelectField
            label="Rebate"
            value={profile.rebate_mode}
            onChange={(v) => patch({ rebate_mode: v as HrEmployeeTaxProfile["rebate_mode"] })}
            options={REBATE_OPTIONS}
            allowEmpty={false}
          />
          {profile.rebate_mode === "DECLARED_INVESTMENT" && (
            <TextField
              label="Declared yearly investment"
              value={profile.declared_annual_investment ?? ""}
              onChange={(v) => patch({ declared_annual_investment: v || null })}
              error={moneyError(profile.declared_annual_investment)}
              inputMode="numeric"
            />
          )}
          <TextField
            label="Fixed monthly tax (optional)"
            value={profile.monthly_tds_override ?? ""}
            onChange={(v) => patch({ monthly_tds_override: v || null })}
            error={moneyError(profile.monthly_tds_override)}
            hint="Used in ordinary months; June or the last month settles the exact difference."
            inputMode="numeric"
          />
          <TextField label="Tax already deducted this year" value={profile.opening_ytd_tds ?? ""} onChange={(v) => patch({ opening_ytd_tds: v || null })} error={moneyError(profile.opening_ytd_tds)} inputMode="numeric" />
          <TextField label="Gross already paid this year" value={profile.opening_ytd_gross ?? ""} onChange={(v) => patch({ opening_ytd_gross: v || null })} error={moneyError(profile.opening_ytd_gross)} inputMode="numeric" />
          <TextField label="Balances cover up to" type="date" value={profile.opening_through_date ?? ""} onChange={(v) => patch({ opening_through_date: v || null })} />
          <TextField label="Income year start" type="date" value={profile.opening_income_year_start ?? ""} onChange={(v) => patch({ opening_income_year_start: v || null })} hint="1 July of the income year." />
          {status && (
            <div className={`sm:col-span-2 lg:col-span-3 text-sm ${status.kind === "success" ? "text-status-success-foreground" : "text-status-danger-foreground"}`} role={status.kind === "error" ? "alert" : "status"}>
              {status.text}
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button type="button" onClick={() => void save()} disabled={saving || invalid} className="rounded bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save tax profile"}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

