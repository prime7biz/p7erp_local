import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type HrEssPayslipResponse } from "@/api/client";
import { saveBlob } from "@/lib/fileSave";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyPayslipFilter {
  year: number;
}

const periodLabel = (r: HrEssPayslipResponse) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;

export function HrMyPayslipsPage() {
  const { t } = useTranslation();
  const [downloadError, setDownloadError] = useState("");

  const download = async (row: HrEssPayslipResponse) => {
    setDownloadError("");
    try {
      const blob = await api.downloadHrPayslipPdf(row.id);
      await saveBlob(blob, `payslip-${periodLabel(row)}.pdf`);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : t("ess.downloadFailed"));
    }
  };

  return (
    <HrSimpleCrudPage<HrEssPayslipResponse, HrMyPayslipFilter>
      title={t("ess.myPayslips")}
      description={t("ess.myPayslipsDesc")}
      emptyMessage={t("ess.noPayslips")}
      breadcrumbs={[{ label: t("ess.hr"), href: "/app/hr" }, { label: t("ess.myPayslips") }]}
      loadItems={() => api.listHrEssMyPayslips()}
      showLanguageSwitcher
      columns={[
        { header: t("ess.period"), cell: periodLabel },
        { header: t("ess.gross"), cell: (row) => row.gross_pay, kind: "money" },
        { header: t("ess.deduction"), cell: (row) => row.deductions, kind: "money" },
        { header: t("ess.net"), cell: (row) => row.net_pay, kind: "money" },
        { header: t("ess.status"), cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row) => [{ key: "pdf", label: t("ess.downloadPdf"), primary: true, onClick: () => void download(row) }]}
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
