import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPayrollBonusesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    bonus_type: "FESTIVAL",
    period_code: "",
    title: "Bonus",
    amount_or_pct: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrPayrollBonuses());
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
      await api.createHrPayrollBonus({
        bonus_type: form.bonus_type,
        period_code: form.period_code,
        title: form.title,
        amount_or_pct: form.amount_or_pct,
      });
      setForm({ bonus_type: "FESTIVAL", period_code: "", title: "Bonus", amount_or_pct: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader title="Bonuses" description="Festival, attendance, or performance bonuses." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Bonuses" }]} />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <select className="rounded border px-2 py-1 text-sm" value={form.bonus_type} onChange={(e) => setForm((p) => ({ ...p, bonus_type: e.target.value }))}>
          <option value="FESTIVAL">Festival</option>
          <option value="ATTENDANCE">Attendance</option>
          <option value="PERFORMANCE">Performance</option>
        </select>
        <input className="rounded border px-2 py-1 text-sm" placeholder="Period code" value={form.period_code} onChange={(e) => setForm((p) => ({ ...p, period_code: e.target.value }))} required />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Amount or %" value={form.amount_or_pct} onChange={(e) => setForm((p) => ({ ...p, amount_or_pct: e.target.value }))} required />
        <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Create declaration
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
                <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Period</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-2">{String(r.id)}</td>
                  <td className="px-4 py-2">{String(r.bonus_type ?? "")}</td>
                  <td className="px-4 py-2">{String(r.period_code ?? "")}</td>
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
