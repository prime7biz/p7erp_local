import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type HrLeaveRequestResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell } from "@/components/hr/kit/HrEmployeeFields";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";

export function HrLeaveApprovalsPage() {
  const [rows, setRows] = useState<HrLeaveRequestResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const leaveTypes = useHrOptions(
    "leaveTypes",
    () => api.listHrLeaveTypes(),
    (t) => ({ value: t.id, label: `${t.code} · ${t.name}` }),
  );
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrLeaveRequests({ status_filter: "PENDING" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: HrLeaveRequestResponse, decision: "approved" | "rejected"): Promise<void> => {
    if (busyId != null) return;
    let note: string | undefined;
    if (decision === "rejected") {
      const entered = window.prompt("Reason for rejecting this leave (optional):", "");
      if (entered == null) return;
      note = entered.trim() || undefined;
    }
    setBusyId(row.id);
    setError("");
    setInfo("");
    try {
      await api.decideHrLeaveRequest(row.id, decision, note);
      const who = lookup(row.employee_id)?.full_name ?? `Employee #${row.employee_id}`;
      setInfo(`${who}: leave ${decision}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    } finally {
      setBusyId(null);
    }
  };

  const columns: HrTableColumn<HrLeaveRequestResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const e = lookup(r.employee_id);
        return e ? `${e.full_name} ${e.employee_code}` : `#${r.employee_id}`;
      },
    },
    { key: "type", header: "Leave type", render: (r) => leaveTypes.labelOf(r.leave_type_id), value: (r) => leaveTypes.labelOf(r.leave_type_id) },
    { key: "from", header: "From", render: (r) => r.from_date, value: (r) => r.from_date },
    { key: "to", header: "To", render: (r) => r.to_date, value: (r) => r.to_date },
    { key: "days", header: "Days", render: (r) => r.days_requested, value: (r) => r.days_requested, align: "right" },
    { key: "reason", header: "Reason", render: (r) => r.reason || "-", value: (r) => r.reason, hideOnMobile: true },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader title="Leave Approvals" description="Approve or reject pending leave requests." />
      {info && (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      )}
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No pending requests"
        emptyHint="New leave requests from the Requests tab or from My HR show up here."
        searchPlaceholder="Search employee, leave type or reason…"
        initialSort={{ key: "from", dir: "asc" }}
        rowActions={(r) => [
          { key: "approve", label: "Approve", primary: true, tone: "positive", disabled: busyId != null, onClick: () => void decide(r, "approved") },
          { key: "reject", label: "Reject", primary: true, disabled: busyId != null, onClick: () => void decide(r, "rejected") },
        ]}
      />
    </div>
  );
}
