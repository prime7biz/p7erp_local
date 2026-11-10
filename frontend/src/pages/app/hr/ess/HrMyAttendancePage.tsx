import { useTranslation } from "react-i18next";
import { api, type HrEssAttendanceSummaryRow } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyAttendanceFilter {
  year: number;
}

const monthLabel = (r: HrEssAttendanceSummaryRow) => `${r.year}-${String(r.month).padStart(2, "0")}`;

export function HrMyAttendancePage() {
  const { t } = useTranslation();
  return (
    <HrSimpleCrudPage<HrEssAttendanceSummaryRow, HrMyAttendanceFilter>
      title={t("ess.myAttendance")}
      description={t("ess.myAttendanceDesc")}
      emptyMessage={t("ess.noAttendance")}
      breadcrumbs={[{ label: t("ess.hr"), href: "/app/hr" }, { label: t("ess.myAttendance") }]}
      loadItems={() => api.listHrEssMyAttendance()}
      rowKey={monthLabel}
      showLanguageSwitcher
      columns={[
        { header: t("ess.month"), cell: monthLabel },
        { header: t("ess.present"), cell: (row) => row.present_days },
        { header: t("ess.absent"), cell: (row) => row.absent_days },
        { header: t("ess.late"), cell: (row) => row.late_days },
        { header: t("ess.overtimeHours"), cell: (row) => Number(row.overtime_hours.toFixed(2)) },
      ]}
    />
  );
}
