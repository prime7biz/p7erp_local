import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  type PayrollStatutoryConfigResponse,
  type PayrollStatutoryPreviewResponse,
  type PtSlabRow,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

const PREFIX = "/app/hr";

const DEFAULT_SLABS: PtSlabRow[] = [
  { from: 0, to: 7500, amount: 0 },
  { from: 7501, to: 10000, amount: 175 },
  { from: 10001, to: null, amount: 200 },
];

const inputClass =
  "mt-1 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/40";
const slabInputClass = "w-28 rounded-lg border border-border-strong bg-surface-raised px-2 py-1 text-sm tabular-nums";
const sectionClass = "space-y-3 rounded-xl border border-border bg-surface-raised p-4";

function emptySlab(): PtSlabRow {
  return { from: 0, to: null, amount: 0 };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={sectionClass} aria-label={title}>
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TextField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <label className="block text-sm font-medium text-text-secondary">
      {label}
      {suffix ? <span className="ml-1 text-xs font-normal text-text-muted">({suffix})</span> : null}
      <input className={inputClass} value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function PayrollStatutoryConfigPage() {
  const [cfg, setCfg] = useState<PayrollStatutoryConfigResponse | null>(null);
  const [slabs, setSlabs] = useState<PtSlabRow[]>(DEFAULT_SLABS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [previewBasic, setPreviewBasic] = useState("15000");
  const [previewGross, setPreviewGross] = useState("25000");
  const [previewYears, setPreviewYears] = useState("5");
  const [preview, setPreview] = useState<PayrollStatutoryPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [form, setForm] = useState({
    pf_employee_rate: "12",
    pf_employer_rate: "12",
    esi_employee_rate: "0.75",
    esi_employer_rate: "3.25",
    pf_wage_ceiling: "15000",
    esi_wage_ceiling: "21000",
    pt_state: "Maharashtra",
    gratuity_days_per_year: "15",
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const c = await api.getPayrollStatutoryConfig();
      setCfg(c);
      setForm({
        pf_employee_rate: c.pf_employee_rate,
        pf_employer_rate: c.pf_employer_rate,
        esi_employee_rate: c.esi_employee_rate,
        esi_employer_rate: c.esi_employer_rate,
        pf_wage_ceiling: c.pf_wage_ceiling,
        esi_wage_ceiling: c.esi_wage_ceiling,
        pt_state: c.pt_state ?? "",
        gratuity_days_per_year: c.gratuity_days_per_year,
        is_active: c.is_active,
      });
      setSlabs(c.pt_slabs?.length ? c.pt_slabs : DEFAULT_SLABS);
    } catch (e) {
      logApiError("PayrollStatutoryConfigPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      await api.updatePayrollStatutoryConfig({
        ...form,
        pt_state: form.pt_state.trim() || null,
        pt_slabs: slabs,
      });
      setMsg("Statutory config saved.");
      await load();
    } catch (err) {
      logApiError("PayrollStatutoryConfigPage.save", err);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    setPreviewLoading(true);
    setError("");
    try {
      const result = await api.previewPayrollStatutoryConfig({
        basic_salary: previewBasic,
        gross_salary: previewGross,
        years_of_service: previewYears || null,
      });
      setPreview(result);
    } catch (err) {
      logApiError("PayrollStatutoryConfigPage.preview", err);
      setError(err instanceof Error ? err.message : "Preview failed");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function updateSlab(index: number, patch: Partial<PtSlabRow>) {
    setSlabs((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const set = (key: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [key]: v }));

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll statutory config"
        description="PF, ESI, professional tax slabs, and gratuity settings for auto-calculate."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Payroll" }, { label: "Statutory config" }]}
      />

      {error ? (
        <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {msg ? (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 max-w-3xl animate-pulse rounded-xl bg-surface-subtle" />
          ))}
        </div>
      ) : (
        <form onSubmit={onSave} className="max-w-3xl space-y-4">
          <Section title="Provident fund (PF)" hint="Contribution rates and the monthly wage ceiling they apply to.">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Employee rate" suffix="%" value={form.pf_employee_rate} onChange={set("pf_employee_rate")} />
              <TextField label="Employer rate" suffix="%" value={form.pf_employer_rate} onChange={set("pf_employer_rate")} />
              <TextField label="Wage ceiling" value={form.pf_wage_ceiling} onChange={set("pf_wage_ceiling")} />
            </div>
          </Section>

          <Section title="Employee state insurance (ESI)" hint="Contribution rates and the gross wage ceiling.">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Employee rate" suffix="%" value={form.esi_employee_rate} onChange={set("esi_employee_rate")} />
              <TextField label="Employer rate" suffix="%" value={form.esi_employer_rate} onChange={set("esi_employer_rate")} />
              <TextField label="Wage ceiling" value={form.esi_wage_ceiling} onChange={set("esi_wage_ceiling")} />
            </div>
          </Section>

          <Section title="Professional tax (PT)" hint="Monthly tax by gross salary band. Leave “To” empty for the top band.">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="PT state" value={form.pt_state} onChange={set("pt_state")} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left text-xs uppercase text-text-muted">
                  <tr>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">To</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2 text-right">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {slabs.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          aria-label={`Slab ${i + 1} from`}
                          className={slabInputClass}
                          value={s.from}
                          onChange={(e) => updateSlab(i, { from: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          aria-label={`Slab ${i + 1} to`}
                          className={slabInputClass}
                          value={s.to ?? ""}
                          placeholder="∞"
                          onChange={(e) => updateSlab(i, { to: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          aria-label={`Slab ${i + 1} amount`}
                          className={slabInputClass}
                          value={s.amount}
                          onChange={(e) => updateSlab(i, { amount: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label={`Remove slab ${i + 1}`}
                          className="rounded-lg border border-border-strong px-2 py-1 text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                          onClick={() => setSlabs((p) => p.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
              onClick={() => setSlabs((p) => [...p, emptySlab()])}
            >
              + Add slab
            </button>
          </Section>

          <Section title="Gratuity">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Days per year of service" value={form.gratuity_days_per_year} onChange={set("gratuity_days_per_year")} />
            </div>
          </Section>

          <div className="sticky bottom-0 z-[1] flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised/95 px-4 py-3 shadow-sm backdrop-blur">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
              Active
              {cfg ? <span className="text-xs text-text-muted">· Config ID {cfg.id}</span> : null}
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save config"}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={onPreview} className={`max-w-3xl ${sectionClass}`}>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Preview calculation</h2>
          <p className="mt-0.5 text-xs text-text-muted">Uses the saved config; nothing is stored.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Sample basic" value={previewBasic} onChange={setPreviewBasic} />
          <TextField label="Sample gross" value={previewGross} onChange={setPreviewGross} />
          <TextField label="Years of service (gratuity)" value={previewYears} onChange={setPreviewYears} />
        </div>
        <button
          type="submit"
          disabled={previewLoading}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          {previewLoading ? "Calculating…" : "Run preview"}
        </button>
        {preview ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-subtle p-3">
              <p className="text-xs font-semibold uppercase text-text-muted">PF</p>
              <p>Employee: <span className="tabular-nums">{preview.pf.employee_pf}</span></p>
              <p>Employer: <span className="tabular-nums">{preview.pf.employer_pf}</span></p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-3">
              <p className="text-xs font-semibold uppercase text-text-muted">ESI</p>
              <p>Employee: <span className="tabular-nums">{preview.esi.employee_esi}</span></p>
              <p>Employer: <span className="tabular-nums">{preview.esi.employer_esi}</span></p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-3">
              <p className="text-xs font-semibold uppercase text-text-muted">Professional tax</p>
              <p className="tabular-nums">
                {preview.pt_amount} ({preview.pt_state ?? "—"})
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle p-3">
              <p className="text-xs font-semibold uppercase text-text-muted">Gratuity (sample)</p>
              <p className="tabular-nums">{preview.gratuity}</p>
            </div>
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3 sm:col-span-2">
              <p>
                Employee statutory deductions: <strong className="tabular-nums">{preview.employee_statutory_deductions}</strong>
              </p>
              <p>
                Employer contributions: <strong className="tabular-nums">{preview.employer_contributions}</strong>
              </p>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
