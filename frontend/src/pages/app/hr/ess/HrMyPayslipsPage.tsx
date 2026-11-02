import { useTranslation } from "react-i18next";
import { api, type HrPayslipResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyPayslipFilter {
  year: number;
}

export function HrMyPayslipsPage() {
  const { t } = useTranslation();
  return (
    <HrSimpleCrudPage<HrPayslipResponse, HrMyPayslipFilter>
      title={t("ess.myPayslips")}
      description={t("ess.myPayslipsDesc")}
      emptyMessage={t("ess.noPayslips")}
      breadcrumbs={[{ label: t("ess.hr"), href: "/app/hr" }, { label: t("ess.myPayslips") }]}
      loadItems={() => api.listHrEssMyPayslips()}
      showLanguageSwitcher
      columns={[
        { header: t("ess.payrollRunId"), cell: (row) => row.payroll_run_id },
        { header: t("ess.gross"), cell: (row) => row.gross_amount },
        { header: t("ess.deduction"), cell: (row) => row.deduction_amount },
        { header: t("ess.net"), cell: (row) => row.net_amount },
        { header: t("ess.status"), cell: (row) => row.status },
      ]}
    />
  );
}
