import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type HrLeaveBalanceResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const cardClass = "rounded-xl border border-border bg-surface-raised p-4 shadow-sm";
const inputClass = "rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";

export function HrLeaveBalancesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrLeaveBalanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromYear, setFromYear] = useState(new Date().getFullYear() - 1);
  const [toYear, setToYear] = useState(new Date().getFullYear());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [encEmp, setEncEmp] = useState<number | null>(null);
  const [encDays, setEncDays] = useState("");
  const [busy, setBusy] = useState(false);
  const leaveTypes = useHrOptions(
    "leaveTypes",
    () => api.listHrLeaveTypes({ active_only: false }),
    (t) => ({ value: t.id, label: `${t.code} · ${t.name}` }),
  );
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

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
    if (!window.confirm(`Carry closing balances from ${fromYear} into ${toYear}?`)) return;
    setMsg(null);
    setBusy(true);
    try {
      const r = await api.postHrLeaveCarryForward({ from_year: fromYear, to_year: toYear });
      setMsg({ ok: true, text: `Carry forward done: ${String((r as { rows_processed?: number }).rows_processed ?? "?")} rows processed.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Carry forward failed" });
    } finally {
      setBusy(false);
    }
  };

  const runEncashment = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const r = await api.postHrLeaveEncashment({
        employee_id: encEmp ?? undefined,
        days: encDays ? Number(encDays) : undefined,
      });
      setMsg({ ok: true, text: String((r as { message?: string }).message ?? "Encashment request noted.") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Encashment failed" });
    } finally {
      setBusy(false);
    }
  };

  const columns: HrTableColumn<HrLeaveBalanceResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const e = lookup(r.employee_id);
        return e ? `${e.full_name} ${e.employee_code}` : `#${r.employee_id}`;
      },
    },
    { key: "type", header: "Leave type", render: (r) => leaveTypes.labelOf(r.leave_type_id), value: (r) => leaveTypes.labelOf(r.leave_type_id) },
    { key: "year", header: "Year", render: (r) => r.balance_year, value: (r) => r.balance_year },
    { key: "allocated", header: "Allocated", align: "right", render: (r) => r.allocated_days, value: (r) => r.allocated_days, hideOnMobile: true },
    { key: "used", header: "Used", align: "right", render: (r) => r.used_days, value: (r) => r.used_days },
    { key: "pending", header: "Pending", align: "right", render: (r) => r.pending_days, value: (r) => r.pending_days, hideOnMobile: true },
    {
      key: "closing",
      header: "Remaining",
      align: "right",
      render: (r) => <span className="font-semibold text-text-primary">{r.closing_balance_days}</span>,
      value: (r) => r.closing_balance_days,
    },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Leave balances"
        description="Allocated, used, and remaining leave by employee and type."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Balances" }]}
      />
      {msg && (
        <div
          role={msg.ok ? "status" : "alert"}
          className={`rounded-lg border px-4 py-2 text-sm ${
            msg.ok
              ? "border-status-success/20 bg-status-success-subtle text-status-success-foreground"
              : "border-status-danger/20 bg-status-danger-subtle text-status-danger-foreground"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cardClass}>
          <h3 className="text-sm font-semibold text-text-primary">Year-end carry forward</h3>
          <p className="mt-1 text-xs text-text-muted">Rolls closing balance from one year to the next (manager / admin).</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-text-secondary">
              <span className="block">From year</span>
              <input type="number" className={`${inputClass} w-28`} value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))} />
            </label>
            <label className="space-y-1 text-xs text-text-secondary">
              <span className="block">To year</span>
              <input type="number" className={`${inputClass} w-28`} value={toYear} onChange={(e) => setToYear(Number(e.target.value))} />
            </label>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90 disabled:opacity-60"
              onClick={() => void runCarryForward()}
            >
              Run carry forward
            </button>
          </div>
        </section>
        <section className={cardClass}>
          <h3 className="text-sm font-semibold text-text-primary">Leave encashment (preview)</h3>
          <p className="mt-1 text-xs text-text-muted">Pays unused leave as a one-off earning through payroll (manager / admin).</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
            <div className="space-y-1 text-xs text-text-secondary">
              <span className="block">Employee</span>
              <HrEmployeeSelect value={encEmp} onChange={setEncEmp} />
            </div>
            <label className="space-y-1 text-xs text-text-secondary">
              <span className="block">Days</span>
              <input className={`${inputClass} w-full`} inputMode="decimal" value={encDays} onChange={(e) => setEncDays(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy || !encEmp}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              onClick={() => void runEncashment()}
            >
              Submit
            </button>
          </div>
        </section>
      </div>

      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No leave balance records found"
        emptyHint="No leave balances have been set up for employees yet."
        searchPlaceholder="Search employee or leave type…"
        exportFileName="leave-balances"
        canExport={canExportHrData(me?.role_name)}
      />
    </div>
  );
}
