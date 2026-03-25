import { useCallback, useEffect, useState } from "react";
import { api, type HrLeaveBalanceResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrLeaveBalancesPage() {
  const [rows, setRows] = useState<HrLeaveBalanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromYear, setFromYear] = useState(new Date().getFullYear() - 1);
  const [toYear, setToYear] = useState(new Date().getFullYear());
  const [cfMsg, setCfMsg] = useState("");
  const [encEmp, setEncEmp] = useState("");
  const [encDays, setEncDays] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrLeaveBalances());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load balances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runCarryForward = async () => {
    setCfMsg("");
    try {
      const r = await api.postHrLeaveCarryForward({ from_year: fromYear, to_year: toYear });
      setCfMsg(`Processed ${String((r as { rows_processed?: number }).rows_processed ?? "?")} rows.`);
      await load();
    } catch (e) {
      setCfMsg(e instanceof Error ? e.message : "Carry forward failed");
    }
  };

  const runEncashment = async () => {
    setCfMsg("");
    try {
      const r = await api.postHrLeaveEncashment({
        employee_id: encEmp ? Number(encEmp) : undefined,
        days: encDays ? Number(encDays) : undefined,
      });
      setCfMsg(String((r as { message?: string }).message ?? "Encashment request noted."));
    } catch (e) {
      setCfMsg(e instanceof Error ? e.message : "Encashment failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Leave balances"
        description="Allocated, used, and remaining leave by employee and type."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Balances" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {cfMsg && <div className="text-sm text-text-secondary">{cfMsg}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="text-sm font-semibold text-text-primary">Year-end carry forward</h3>
          <p className="mt-1 text-xs text-text-muted">Rolls closing balance from one year to the next (manager/admin).</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-text-secondary">
              From year
              <input
                type="number"
                className="ml-2 w-24 rounded border px-2 py-1 text-sm"
                value={fromYear}
                onChange={(e) => setFromYear(Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-text-secondary">
              To year
              <input
                type="number"
                className="ml-2 w-24 rounded border px-2 py-1 text-sm"
                value={toYear}
                onChange={(e) => setToYear(Number(e.target.value))}
              />
            </label>
            <button type="button" className="rounded bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void runCarryForward()}>
              Run carry forward
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="text-sm font-semibold text-text-primary">Leave encashment (preview)</h3>
          <p className="mt-1 text-xs text-text-muted">Posts one-off earning via payroll (manager/admin).</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input
              className="w-28 rounded border px-2 py-1 text-sm"
              placeholder="Employee ID"
              value={encEmp}
              onChange={(e) => setEncEmp(e.target.value)}
            />
            <input
              className="w-24 rounded border px-2 py-1 text-sm"
              placeholder="Days"
              value={encDays}
              onChange={(e) => setEncDays(e.target.value)}
            />
            <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-xs" onClick={() => void runEncashment()}>
              Submit
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No leave balance records found.</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Leave type</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Year</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Allocated</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Used</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Pending</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2">{row.employee_id}</td>
                  <td className="px-4 py-2">{row.leave_type_id}</td>
                  <td className="px-4 py-2">{row.balance_year}</td>
                  <td className="px-4 py-2">{row.allocated_days}</td>
                  <td className="px-4 py-2">{row.used_days}</td>
                  <td className="px-4 py-2">{row.pending_days}</td>
                  <td className="px-4 py-2">{row.closing_balance_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
