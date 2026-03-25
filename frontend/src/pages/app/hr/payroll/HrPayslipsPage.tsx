import { useCallback, useEffect, useState } from "react";
import { api, type HrPayslipResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrPayslipFilter {
  run_id: number;
}

export function HrPayslipsPage() {
  const [slips, setSlips] = useState<HrPayslipResponse[]>([]);

  const refresh = useCallback(async () => {
    try {
      setSlips(await api.listHrPayslips());
    } catch {
      setSlips([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloadPdf = async (id: number) => {
    const blob = await api.downloadHrPayslipPdf(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-${id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <HrSimpleCrudPage<HrPayslipResponse, HrPayslipFilter>
      title="Payslips"
      description="Review generated payslips and net payment values."
      emptyMessage="No payslips found."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Payslips" }]}
      loadItems={() => api.listHrPayslips()}
      columns={[
        { header: "Payroll Run ID", cell: (row) => row.payroll_run_id },
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Gross", cell: (row) => row.gross_amount },
        { header: "Deductions", cell: (row) => row.deduction_amount },
        { header: "Net", cell: (row) => row.net_amount },
        { header: "Status", cell: (row) => row.status },
      ]}
      footer={
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="text-sm font-semibold text-text-primary">Download payslip (text/PDF placeholder)</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {slips.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span>
                  #{s.id} — Emp {s.employee_id} — Net {s.net_amount}
                </span>
                <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => void downloadPdf(s.id)}>
                  Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
