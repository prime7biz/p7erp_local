import { FormEvent, useCallback, useEffect, useState } from "react";
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

function emptySlab(): PtSlabRow {
  return { from: 0, to: null, amount: 0 };
}

export function PayrollStatutoryConfigPage() {
  const [cfg, setCfg] = useState<PayrollStatutoryConfigResponse | null>(null);
  const [slabs, setSlabs] = useState<PtSlabRow[]>(DEFAULT_SLABS);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll statutory config"
        description="PF, ESI, professional tax slabs, and gratuity settings for auto-calculate."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Payroll" }, { label: "Statutory config" }]}
      />

      {error ? <div className="text-sm text-status-danger-foreground">{error}</div> : null}
      {msg ? <div className="text-sm text-green-700">{msg}</div> : null}

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : (
        <form onSubmit={onSave} className="max-w-3xl space-y-4 rounded-xl border border-border bg-surface-raised p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-text-secondary">
              PF employee rate %
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.pf_employee_rate}
                onChange={(e) => setForm((p) => ({ ...p, pf_employee_rate: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              PF employer rate %
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.pf_employer_rate}
                onChange={(e) => setForm((p) => ({ ...p, pf_employer_rate: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              ESI employee rate %
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.esi_employee_rate}
                onChange={(e) => setForm((p) => ({ ...p, esi_employee_rate: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              ESI employer rate %
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.esi_employer_rate}
                onChange={(e) => setForm((p) => ({ ...p, esi_employer_rate: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              PF wage ceiling
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.pf_wage_ceiling}
                onChange={(e) => setForm((p) => ({ ...p, pf_wage_ceiling: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              ESI wage ceiling
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.esi_wage_ceiling}
                onChange={(e) => setForm((p) => ({ ...p, esi_wage_ceiling: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              PT state
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.pt_state}
                onChange={(e) => setForm((p) => ({ ...p, pt_state: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-text-secondary">
              Gratuity days per year
              <input
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={form.gratuity_days_per_year}
                onChange={(e) => setForm((p) => ({ ...p, gratuity_days_per_year: e.target.value }))}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">PT slabs</p>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setSlabs((p) => [...p, emptySlab()])}
              >
                Add row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-text-muted">
                  <tr>
                    <th className="px-2 py-1">From</th>
                    <th className="px-2 py-1">To</th>
                    <th className="px-2 py-1">Amount</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((s, i) => (
                    <tr key={i} className="border-t border-border-subtle">
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className="w-24 rounded border px-1 py-0.5 text-sm"
                          value={s.from}
                          onChange={(e) => updateSlab(i, { from: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className="w-24 rounded border px-1 py-0.5 text-sm"
                          value={s.to ?? ""}
                          placeholder="∞"
                          onChange={(e) =>
                            updateSlab(i, { to: e.target.value === "" ? null : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className="w-24 rounded border px-1 py-0.5 text-sm"
                          value={s.amount}
                          onChange={(e) => updateSlab(i, { amount: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          className="text-xs text-red-600"
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
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>

          {cfg ? (
            <p className="text-xs text-text-muted">Config ID {cfg.id}</p>
          ) : null}

          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Save config
          </button>
        </form>
      )}

      <form
        onSubmit={onPreview}
        className="max-w-3xl space-y-3 rounded-xl border border-border bg-surface-raised p-4"
      >
        <p className="text-sm font-medium text-text-primary">Preview calculation</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-text-secondary">
            Sample basic
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={previewBasic}
              onChange={(e) => setPreviewBasic(e.target.value)}
            />
          </label>
          <label className="block text-sm text-text-secondary">
            Sample gross
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={previewGross}
              onChange={(e) => setPreviewGross(e.target.value)}
            />
          </label>
          <label className="block text-sm text-text-secondary">
            Years of service (gratuity)
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={previewYears}
              onChange={(e) => setPreviewYears(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={previewLoading}
          className="rounded border px-3 py-1.5 text-sm hover:bg-surface-subtle disabled:opacity-50"
        >
          {previewLoading ? "Calculating…" : "Run preview"}
        </button>
        {preview ? (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-xs font-semibold text-blue-800">PF</p>
              <p>Employee: {preview.pf.employee_pf}</p>
              <p>Employer: {preview.pf.employer_pf}</p>
            </div>
            <div className="rounded border border-blue-200 bg-blue-50 p-2">
              <p className="text-xs font-semibold text-blue-800">ESI</p>
              <p>Employee: {preview.esi.employee_esi}</p>
              <p>Employer: {preview.esi.employer_esi}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs font-semibold">Professional tax</p>
              <p>{preview.pt_amount} ({preview.pt_state ?? "—"})</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs font-semibold">Gratuity (sample)</p>
              <p>{preview.gratuity}</p>
            </div>
            <div className="sm:col-span-2 rounded border p-2">
              <p>
                Employee statutory deductions: <strong>{preview.employee_statutory_deductions}</strong>
              </p>
              <p>
                Employer contributions: <strong>{preview.employer_contributions}</strong>
              </p>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
