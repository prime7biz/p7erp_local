import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type HrEssLeaveRequestResponse } from "@/api/client";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // All types (also switched-off ones) for names in the history; only active types can be chosen.
  const allTypes = useHrOptions(
    "essLeaveTypesAll",
    () => api.listHrLeaveTypes({ active_only: false }),
    (lt) => ({ value: lt.id, label: lt.name }),
  );
  const activeTypes = useHrOptions(
    "essLeaveTypesActive",
    () => api.listHrLeaveTypes({ active_only: false }).then((rows) => rows.filter((lt) => lt.is_active)),
    (lt) => ({ value: lt.id, label: lt.name }),
  );

  // The self-service API sends the leave type id as text in `leave_type`.
  const typeName = (row: HrEssLeaveRequestResponse) => {
    const id = Number(row.leave_type);
    return Number.isInteger(id) && id > 0 ? allTypes.labelOf(id) : row.leave_type;
  };

  const submit = async (row: HrEssLeaveRequestResponse, refresh: () => Promise<void>) => {
    setMsg(null);
    try {
      await api.submitHrLeaveRequest(row.id);
      setMsg({ ok: true, text: t("ess.submitted") });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("crud.saveFailed") });
    }
  };

  return (
    <HrSimpleCrudPage<HrEssLeaveRequestResponse, HrMyLeaveCreate>
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
        { key: "leave_type_id", label: t("ess.leaveTypeId"), type: "select", required: true, options: activeTypes.options },
        { key: "from_date", label: t("ess.fromDate"), type: "date", required: true },
        { key: "to_date", label: t("ess.toDate"), type: "date", required: true },
        { key: "days_requested", label: t("ess.daysRequested"), type: "text", required: true },
        { key: "reason", label: t("ess.reason"), type: "textarea" },
      ]}
      columns={[
        { header: t("ess.leaveType"), cell: typeName },
        { header: t("ess.from"), cell: (row) => row.start_date },
        { header: t("ess.to"), cell: (row) => row.end_date },
        { header: t("ess.days"), cell: (row) => row.days_count },
        { header: t("ess.reason"), cell: (row) => row.reason, hideOnMobile: true },
        { header: t("ess.status"), cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row, { refresh }) =>
        row.status === "DRAFT"
          ? [{ key: "submit", label: t("ess.submit"), primary: true, tone: "positive", onClick: () => void submit(row, refresh) }]
          : []
      }
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
