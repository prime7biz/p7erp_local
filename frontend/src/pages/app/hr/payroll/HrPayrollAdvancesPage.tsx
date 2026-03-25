import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPayrollAdvancesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    employee_id: "",
    amount: "",
    monthly_deduction: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrPayrollAdvances());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createHrPayrollAdvance({
        employee_id: Number(form.employee_id),
        amount: form.amount,
        monthly_deduction: form.monthly_deduction,
        reason: form.reason || null,
      });
      setForm({ employee_id: "", amount: "", monthly_deduction: "", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Employee advances & loans"
        description="Track salary advances and monthly recovery."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Advances" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onCreate} className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-3">
        <input className="rounded border px-2 py-1 text-sm" placeholder="Employee ID" value={form.employee_id} onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))} required />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Monthly deduction" value={form.monthly_deduction} onChange={(e) => setForm((p) => ({ ...p, monthly_deduction: e.target.value }))} required />
        <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Reason" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
        <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Issue advance
        </button>
      </form>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Amount</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Outstanding</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-2">{String(r.id)}</td>
                  <td className="px-4 py-2">{String(r.employee_id)}</td>
                  <td className="px-4 py-2">{String(r.amount ?? "")}</td>
                  <td className="px-4 py-2">{String(r.outstanding ?? "")}</td>
                  <td className="px-4 py-2">{String(r.status ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
