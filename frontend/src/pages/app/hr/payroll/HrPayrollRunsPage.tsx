import { useCallback, useEffect, useState } from "react";
import { api, type HrPayrollPeriodResponse, type HrPayrollRunCreate, type HrPayrollRunResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPayrollRunsPage() {
  const [runs, setRuns] = useState<HrPayrollRunResponse[]>([]);
  const [periods, setPeriods] = useState<HrPayrollPeriodResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<HrPayrollRunCreate>({
    period_id: 0,
    run_date: new Date().toISOString().slice(0, 10),
    run_code: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, p] = await Promise.all([api.listHrPayrollRuns(), api.listHrPayrollPeriods()]);
      setRuns(r);
      setPeriods(p.filter((x) => !x.is_locked));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRuns([]);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.period_id) {
      setMsg("Select a payroll period.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      const payload: HrPayrollRunCreate = {
        period_id: form.period_id,
        run_date: form.run_date,
        run_code: form.run_code?.trim() ? form.run_code.trim() : undefined,
      };
      await api.createHrPayrollRun(payload);
      setMsg("Payroll run created.");
      setForm((f) => ({ ...f, run_code: "" }));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setMsg("");
    try {
      const r = await fn();
      setMsg(`${label} OK.`);
      if (r && typeof r === "object" && "voucher_id" in r) {
        setMsg(`${label} — voucher ${String((r as { voucher_id?: unknown }).voucher_id ?? "")}`);
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${label} failed`);
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll runs"
        description="Create a run for an open period, then add lines (structure or manual), finalize, approve, post to GL, and generate payslips."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Runs" }]}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {msg && <div className="text-sm text-text-secondary">{msg}</div>}

      <form onSubmit={(e) => void createRun(e)} className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">New payroll run</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-secondary">
            Payroll period
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.period_id || ""}
              onChange={(e) => setForm((f) => ({ ...f, period_id: Number(e.target.value) }))}
              required
            >
              <option value="">Select period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.period_code} ({p.start_date} – {p.end_date})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Run date
            <input
              type="date"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.run_date}
              onChange={(e) => setForm((f) => ({ ...f, run_date: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-text-secondary">
            Run code (optional)
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.run_code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, run_code: e.target.value }))}
              placeholder="Auto if empty"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create run"}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No payroll runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">Run</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Period</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Net</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2 font-medium">{r.run_code}</td>
                    <td className="px-4 py-2">{r.period_id}</td>
                    <td className="px-4 py-2">{r.run_date}</td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2">{r.net_total}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() =>
                            void runAction("Finalize", () => api.finalizeHrPayrollRun(r.id))
                          }
                          disabled={!["DRAFT", "CHECKED", "REJECTED"].includes(r.status)}
                        >
                          Finalize
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() =>
                            void runAction("Approve", () => api.approveHrPayrollRun(r.id, {}))
                          }
                          disabled={!["FINALIZED", "CHECKED"].includes(r.status)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() =>
                            void runAction("Post to GL", () => api.postHrPayrollRun(r.id, {}))
                          }
                          disabled={!["APPROVED", "POSTED"].includes(r.status)}
                        >
                          Post GL
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() =>
                            void runAction("Payslips", () => api.generateHrPayrollPayslips(r.id))
                          }
                          disabled={!["APPROVED", "POSTED"].includes(r.status)}
                        >
                          Payslips
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={async () => {
                            setMsg("");
                            try {
                              const blob = await api.downloadHrPayrollRunBankFile(r.id);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `payroll-run-${r.id}-bank.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (e) {
                              setMsg(e instanceof Error ? e.message : "Download failed");
                            }
                          }}
                        >
                          Bank CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
