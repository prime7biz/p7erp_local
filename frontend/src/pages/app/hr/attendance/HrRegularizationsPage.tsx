import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type HrRegularizationResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell } from "@/components/hr/kit/HrEmployeeFields";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "-");

export function HrRegularizationsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrRegularizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrRegularizations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: number) => {
    if (busyId != null) return;
    setBusyId(id);
    setInfo("");
    setActionError("");
    try {
      await api.approveHrRegularization(id, {});
      setInfo("Request approved.");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: number) => {
    if (busyId != null) return;
    const entered = window.prompt("Reason for rejecting this request:", "Rejected");
    if (entered == null) return;
    setBusyId(id);
    setInfo("");
    setActionError("");
    try {
      await api.rejectHrRegularization(id, { decision_note: entered.trim() || "Rejected" });
      setInfo("Request rejected.");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const columns: HrTableColumn<HrRegularizationResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const e = lookup(r.employee_id);
        return e ? `${e.full_name} ${e.employee_code}` : r.employee_id ? `#${r.employee_id}` : "";
      },
    },
    { key: "id", header: "Request", render: (r) => <span className="font-medium text-text-primary">#{r.id}</span>, value: (r) => r.id, hideOnMobile: true },
    { key: "entry", header: "Attendance entry", render: (r) => `#${r.attendance_entry_id}`, value: (r) => r.attendance_entry_id, hideOnMobile: true },
    {
      key: "times",
      header: "Requested in / out",
      render: (r) => `${hhmm(r.requested_in_time)} – ${hhmm(r.requested_out_time)}`,
      value: (r) => `${hhmm(r.requested_in_time)} - ${hhmm(r.requested_out_time)}`,
    },
    { key: "reason", header: "Reason", render: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span>, value: (r) => r.reason },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    { key: "note", header: "Decision note", render: (r) => r.decision_note || "-", value: (r) => r.decision_note, hideOnMobile: true },
    { key: "created", header: "Requested on", render: (r) => r.created_at.slice(0, 10), value: (r) => r.created_at, hideOnMobile: true },
  ];

  const rowActions = (r: HrRegularizationResponse): HrRowAction[] =>
    r.status === "PENDING"
      ? [
          { key: "approve", label: "Approve", primary: true, tone: "positive", disabled: busyId != null, onClick: () => void approve(r.id) },
          { key: "reject", label: "Reject", primary: true, disabled: busyId != null, onClick: () => void reject(r.id) },
        ]
      : [];

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Attendance regularizations"
        description="Employees request corrections to punch times; managers approve or reject."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Regularizations" }]}
      />
      {info ? (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {actionError}
        </div>
      ) : null}
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No regularization requests"
        emptyHint="Requests appear here when employees ask to correct their punch times."
        searchPlaceholder="Search reason, entry or status…"
        initialSort={{ key: "created", dir: "desc" }}
        statusOf={(r) => r.status}
        exportFileName="hr-regularizations"
        canExport={canExportHrData(me?.role_name)}
        rowActions={rowActions}
      />
    </div>
  );
}
