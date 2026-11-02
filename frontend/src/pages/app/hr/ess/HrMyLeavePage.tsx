import { useTranslation } from "react-i18next";
import { api, type HrLeaveRequestResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyLeaveCreate {
  leave_type_id: number;
  from_date: string;
  to_date: string;
  days_requested: string;
  reason: string;
}

export function HrMyLeavePage() {
  const { t } = useTranslation();
  return (
    <HrSimpleCrudPage<HrLeaveRequestResponse, HrMyLeaveCreate>
      title={t("ess.myLeave")}
      description={t("ess.myLeaveDesc")}
      emptyMessage={t("ess.noLeave")}
      breadcrumbs={[{ label: t("ess.hr"), href: "/app/hr" }, { label: t("ess.myLeave") }]}
      loadItems={() => api.listHrEssMyLeaveRequests()}
      createItem={(payload) => api.createHrEssMyLeaveRequest(payload)}
      createLabel={t("ess.requestLeave")}
      showLanguageSwitcher
      initialForm={{
        leave_type_id: 0,
        from_date: "",
        to_date: "",
        days_requested: "1",
        reason: "",
      }}
      fields={[
        { key: "leave_type_id", label: t("ess.leaveTypeId"), type: "number", required: true },
        { key: "from_date", label: t("ess.fromDate"), type: "date", required: true },
        { key: "to_date", label: t("ess.toDate"), type: "date", required: true },
        { key: "days_requested", label: t("ess.daysRequested"), type: "text", required: true },
        { key: "reason", label: t("ess.reason"), type: "text" },
      ]}
      columns={[
        { header: t("ess.leaveTypeId"), cell: (row) => row.leave_type_id },
        { header: t("ess.from"), cell: (row) => row.from_date },
        { header: t("ess.to"), cell: (row) => row.to_date },
        { header: t("ess.days"), cell: (row) => row.days_requested },
        { header: t("ess.status"), cell: (row) => row.status },
      ]}
    />
  );
}
