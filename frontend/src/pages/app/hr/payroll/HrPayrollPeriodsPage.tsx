import { useCallback, useEffect, useState } from "react";
import { api, type HrPayrollPeriodCreate, type HrPayrollPeriodResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrPayrollPeriodsPage() {
  const [periods, setPeriods] = useState<HrPayrollPeriodResponse[]>([]);
  const [msg, setMsg] = useState("");

  const refreshFooter = useCallback(async () => {
    try {
      setPeriods(await api.listHrPayrollPeriods());
    } catch {
      setPeriods([]);
    }
  }, []);

  useEffect(() => {
    void refreshFooter();
  }, [refreshFooter]);

  const finalize = async (id: number) => {
    setMsg("");
    try {
      await api.finalizeHrPayrollPeriod(id);
      setMsg(`Period ${id} finalized (locked).`);
      await refreshFooter();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Finalize failed");
    }
  };

  return (
    <HrSimpleCrudPage<HrPayrollPeriodResponse, HrPayrollPeriodCreate>
      title="Payroll Periods"
      description="Define payroll period calendar for salary processing. Finalize a period when it should no longer accept new runs."
      emptyMessage="No payroll periods found."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Periods" }]}
      loadItems={() => api.listHrPayrollPeriods()}
      createItem={(payload) => api.createHrPayrollPeriod(payload)}
      createLabel="Add payroll period"
      initialForm={{
        period_code: "",
        start_date: "",
        end_date: "",
        payment_date: "",
      }}
      fields={[
        { key: "period_code", label: "Period code", type: "text", required: true },
        { key: "start_date", label: "Start date", type: "date", required: true },
        { key: "end_date", label: "End date", type: "date", required: true },
        { key: "payment_date", label: "Payment date", type: "date", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.period_code },
        { header: "Start", cell: (row) => row.start_date },
        { header: "End", cell: (row) => row.end_date },
        { header: "Payment", cell: (row) => row.payment_date },
        { header: "Status", cell: (row) => row.status },
        { header: "Locked", cell: (row) => (row.is_locked ? "Yes" : "No") },
      ]}
      footer={
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Finalize period (manager/admin)</h3>
            <button type="button" className="text-xs text-text-muted underline" onClick={() => void refreshFooter()}>
              Reload list
            </button>
          </div>
          <p className="text-xs text-text-muted">Locks the period so new payroll runs cannot be created against it.</p>
          {msg && <p className="text-sm text-text-secondary">{msg}</p>}
          <ul className="space-y-2 text-sm">
            {periods.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-1">
                <span className="font-medium">{p.period_code}</span>
                <span className="text-text-muted">{p.status}</span>
                <button
                  type="button"
                  disabled={p.is_locked || p.status === "FINALIZED"}
                  className="rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                  onClick={() => void finalize(p.id)}
                >
                  Finalize
                </button>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
