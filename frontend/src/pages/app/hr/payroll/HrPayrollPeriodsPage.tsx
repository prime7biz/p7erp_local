import { useState } from "react";
import { api, type HrPayrollPeriodCreate, type HrPayrollPeriodResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrPayrollPeriodsPage() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const finalize = async (row: HrPayrollPeriodResponse, refresh: () => Promise<void>) => {
    if (!window.confirm(`Finalize ${row.period_code}? It is locked and no new payroll runs can be created for it.`)) return;
    setMsg(null);
    try {
      await api.finalizeHrPayrollPeriod(row.id);
      setMsg({ ok: true, text: `Period ${row.period_code} finalized (locked).` });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Finalize failed" });
    }
  };

  return (
    <HrSimpleCrudPage<HrPayrollPeriodResponse, HrPayrollPeriodCreate>
      title="Payroll Periods"
      description="Define the payroll calendar. Finalize a period when it should no longer accept new runs (manager / admin)."
      emptyMessage="No payroll periods found."
      emptyHint="Create one period per salary month, for example 2026-11."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Periods" }]}
      loadItems={() => api.listHrPayrollPeriods()}
      createItem={(payload) => api.createHrPayrollPeriod(payload)}
      createLabel="Add payroll period"
      exportFileName="payroll-periods"
      initialForm={{
        period_code: "",
        start_date: "",
        end_date: "",
        payment_date: "",
      }}
      fields={[
        { key: "period_code", label: "Period code", type: "text", required: true, placeholder: "2026-11" },
        { key: "start_date", label: "Start date", type: "date", required: true },
        { key: "end_date", label: "End date", type: "date", required: true },
        { key: "payment_date", label: "Payment date", type: "date", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.period_code },
        { header: "Start", cell: (row) => row.start_date },
        { header: "End", cell: (row) => row.end_date },
        { header: "Payment", cell: (row) => row.payment_date, hideOnMobile: true },
        { header: "Status", cell: (row) => row.status, kind: "status" },
        { header: "Locked", cell: (row) => (row.is_locked ? "Yes" : "No") },
      ]}
      rowActions={(row, { refresh }) => [
        {
          key: "finalize",
          label: "Finalize",
          primary: true,
          disabled: row.is_locked || row.status === "FINALIZED",
          onClick: () => void finalize(row, refresh),
        },
      ]}
      footer={
        msg ? (
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
        ) : null
      }
    />
  );
}
