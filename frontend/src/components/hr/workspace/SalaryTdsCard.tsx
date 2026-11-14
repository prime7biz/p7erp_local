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
      {estimate.supported && <TdsCalculationDetails estimate={estimate} />}
    </div>
  );
}

/** Display-only amount with thousand separators (the server value stays the source). */
function taka(value: string | null | undefined): string {
  const n = Number(value ?? "0");
  if (!Number.isFinite(n)) return value ?? "";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(rate: string): string {
  const n = Number(rate) * 100;
  return `${Number.isFinite(n) ? Number(n.toFixed(2)) : rate}%`;
}

/** Step-by-step yearly calculation with every slab of the schedule (slabs not reached show 0). */
export function TdsCalculationDetails({ estimate }: { estimate: HrTdsEstimate }) {
  const slabs = estimate.slab_schedule ?? [];
  if (!estimate.annual_gross || slabs.length === 0) return null;
  const childAdd = Number(estimate.disabled_child_allowance ?? "0") > 0;
  const rebate = Number(estimate.investment_rebate ?? "0") > 0;
  const steps: { label: string; value: string; strong?: boolean }[] = [
    { label: "Yearly gross (monthly gross x 12)", value: taka(estimate.annual_gross) },
    { label: "Less: exempt income (one third, at most 5,00,000)", value: `- ${taka(estimate.exempt_income)}` },
    { label: "Taxable income", value: taka(estimate.taxable_income), strong: true },
    {
      label: `Tax-free limit (${estimate.category_label ?? estimate.category ?? "category"})${childAdd ? " + disabled-child addition" : ""}`,
      value: taka(estimate.threshold),
    },
  ];
  return (
    <details className="mt-2 rounded border border-border bg-surface-raised p-2" data-testid="tds-details">
      <summary className="cursor-pointer text-xs font-semibold text-brand-primary">Show calculation</summary>
      <div className="mt-2 space-y-3 text-xs">
        {estimate.assessment_year && <p className="text-text-muted">Assessment year {estimate.assessment_year}</p>}
        <table className="w-full">
          <tbody>
            {steps.map((s) => (
              <tr key={s.label} className="border-t border-border-subtle">
                <td className="py-1 pr-2 text-text-secondary">{s.label}</td>
                <td className={`py-1 text-right tabular-nums ${s.strong ? "font-semibold text-text-primary" : "text-text-primary"}`}>{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="overflow-x-auto">
          <table className="min-w-full" aria-label="Tax slabs">
            <thead className="bg-surface-subtle text-text-muted">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Taxable income band</th>
                <th className="px-2 py-1 text-right font-medium">Rate</th>
                <th className="px-2 py-1 text-right font-medium">Amount taxed</th>
                <th className="px-2 py-1 text-right font-medium">Tax</th>
              </tr>
            </thead>
            <tbody>
              {slabs.map((row) => {
                const reached = Number(row.taxed_amount) > 0;
                return (
                  <tr key={row.from} className={`border-t border-border-subtle ${reached ? "text-text-primary" : "text-text-muted"}`}>
                    <td className="px-2 py-1">
                      {row.tax_free ? `First ${taka(row.to)} (tax free)` : row.to ? `${taka(row.from)} – ${taka(row.to)}` : `Above ${taka(row.from)}`}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{percent(row.rate)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{taka(row.taxed_amount)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{taka(row.tax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <table className="w-full">
          <tbody>
            <tr className="border-t border-border-subtle">
              <td className="py-1 text-text-secondary">Tax on slabs</td>
              <td className="py-1 text-right tabular-nums text-text-primary">{taka(estimate.slab_tax)}</td>
            </tr>
            {rebate && (
              <tr className="border-t border-border-subtle">
                <td className="py-1 text-text-secondary">Less: investment rebate</td>
                <td className="py-1 text-right tabular-nums text-text-primary">- {taka(estimate.investment_rebate)}</td>
              </tr>
            )}
            {estimate.minimum_tax_applied && (
              <tr className="border-t border-border-subtle">
                <td className="py-1 text-text-secondary">Minimum tax applies</td>
                <td className="py-1 text-right tabular-nums text-text-primary">{taka(estimate.minimum_tax)}</td>
              </tr>
            )}
            <tr className="border-t border-border-subtle">
              <td className="py-1 font-semibold text-text-primary">Yearly tax</td>
              <td className="py-1 text-right font-semibold tabular-nums text-text-primary">{taka(estimate.net_annual_tax)}</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-1 font-semibold text-text-primary">Monthly TDS (yearly tax / 12)</td>
              <td className="py-1 text-right font-semibold tabular-nums text-text-primary">{taka(estimate.monthly_tds)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

type Props = {
  employeeId: number;
  estimate: HrTdsEstimate | null | undefined;
  canManage: boolean;
  /** Called after the profile was saved so the estimate can be reloaded. */
  onSaved: () => void;
  /** Approval mode: send the profile for Tier 1 / Tier 2 approval; returns the message to show. */
  onSubmitForApproval?: (body: Omit<HrEmployeeTaxProfile, "exists">) => Promise<string>;
};

export function SalaryTdsCard({ employeeId, estimate, canManage, onSaved, onSubmitForApproval }: Props) {
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
      if (onSubmitForApproval) {
        setStatus({ kind: "success", text: await onSubmitForApproval(body) });
        return;
      }
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
              {saving ? "Saving…" : onSubmitForApproval ? "Submit tax profile for approval" : "Save tax profile"}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

