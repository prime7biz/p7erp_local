import { useState } from "react";
import { api, type HrPayslipResponse } from "@/api/client";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";
import { preferShareOverPrint, shareOrSaveBlob } from "@/lib/fileSave";
import { useMediaQuery } from "@/hooks/useInventoryListView";
import { useMobileUiV2Phone } from "@/hooks/useMobileUiV2";
import { PHONE_MEDIA_QUERY } from "@/lib/mobileUi";

interface HrPayslipFilter {
  run_id: number;
}

export function HrPayslipsPage() {
  const [downloadError, setDownloadError] = useState("");
  const mobileV2Phone = useMobileUiV2Phone();
  const narrow = useMediaQuery(PHONE_MEDIA_QUERY);
  const phoneActions = preferShareOverPrint(mobileV2Phone || narrow);
  const runs = useHrOptions(
    "payrollRuns",
    () => api.listHrPayrollRuns(),
    (r) => ({ value: r.id, label: r.run_code }),
  );

  const downloadPdf = async (id: number) => {
    setDownloadError("");
    try {
      const blob = await api.downloadHrPayslipPdf(id);
      await shareOrSaveBlob(blob, `payslip-${id}.pdf`);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Could not download the payslip");
    }
  };

  return (
    <HrSimpleCrudPage<HrPayslipResponse, HrPayslipFilter>
      title="Payslips"
      description="Review generated payslips and net payment values. Download any payslip as PDF."
      emptyMessage="No payslips found."
      emptyHint="Payslips appear after a payroll run is approved and payslips are generated on the Runs tab."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Payslips" }]}
      loadItems={() => api.listHrPayslips()}
      exportFileName="payslips"
      columns={[
        { header: "Employee", cell: (row) => row.employee_id, kind: "employee" },
        { header: "Payroll run", cell: (row) => runs.labelOf(row.payroll_run_id) },
        { header: "Gross", cell: (row) => row.gross_amount, kind: "money" },
        { header: "Deductions", cell: (row) => row.deduction_amount, kind: "money", hideOnMobile: true },
        { header: "Net", cell: (row) => row.net_amount, kind: "money" },
        { header: "Status", cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row) => [
        {
          key: "pdf",
          label: phoneActions ? "Share / Save PDF" : "Download PDF",
          primary: true,
          onClick: () => void downloadPdf(row.id),
        },
      ]}
      footer={
        downloadError ? (
          <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
            {downloadError}
          </div>
        ) : null
      }
    />
  );
}
