import { useTranslation } from "react-i18next";
import { api, type HrAttendanceEntryResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyAttendanceFilter {
  from_date: string;
}

export function HrMyAttendancePage() {
  const { t } = useTranslation();
  return (
    <HrSimpleCrudPage<HrAttendanceEntryResponse, HrMyAttendanceFilter>
      title={t("ess.myAttendance")}
      description={t("ess.myAttendanceDesc")}
      emptyMessage={t("ess.noAttendance")}
      breadcrumbs={[{ label: t("ess.hr"), href: "/app/hr" }, { label: t("ess.myAttendance") }]}
      loadItems={() => api.listHrEssMyAttendance()}
      showLanguageSwitcher
      columns={[
        { header: t("ess.date"), cell: (row) => row.attendance_date },
        { header: t("ess.in"), cell: (row) => row.in_time },
        { header: t("ess.out"), cell: (row) => row.out_time },
        { header: t("ess.status"), cell: (row) => row.status },
        { header: t("ess.remarks"), cell: (row) => row.remarks },
      ]}
    />
  );
}
