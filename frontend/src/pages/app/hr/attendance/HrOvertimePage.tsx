import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell } from "@/components/hr/kit/HrEmployeeFields";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";

type OtRow = Record<string, unknown>;

export function HrOvertimePage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<OtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => Number(r.employee_id)), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrOvertimeEntries());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overtime");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await api.approveHrOvertimeEntry(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve overtime");
    } finally {
      setBusyId(null);
    }
  };

  const columns: HrTableColumn<OtRow>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={Number(r.employee_id)} lookup={lookup} />,
      value: (r) => {
        const e = lookup(Number(r.employee_id));
        return e ? `${e.full_name} ${e.employee_code}` : `#${String(r.employee_id)}`;
      },
    },
    { key: "date", header: "Date", render: (r) => String(r.work_date ?? "-"), value: (r) => String(r.work_date ?? "") },
    { key: "hours", header: "Hours", align: "right", render: (r) => String(r.ot_hours ?? "-"), value: (r) => Number(r.ot_hours ?? 0) },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={String(r.status ?? "")} />, value: (r) => String(r.status ?? "") },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader title="Overtime entries" description="Review and approve overtime hours. Payroll uses approved overtime for the period." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Overtime" }]} />
      <HrDataTable
        rows={rows}
        rowKey={(r) => String(r.id)}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No overtime entries"
        emptyHint="Overtime entries waiting for approval appear here."
        searchPlaceholder="Search employee or date…"
        statusOf={(r) => String(r.status ?? "")}
        initialSort={{ key: "date", dir: "desc" }}
        exportFileName="overtime"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) =>
          r.status === "PENDING"
            ? [
                {
                  key: "approve",
                  label: busyId === Number(r.id) ? "Working…" : "Approve",
                  primary: true,
                  tone: "positive",
                  disabled: busyId != null,
                  onClick: () => void approve(Number(r.id)),
                },
              ]
            : []
        }
      />
    </div>
  );
}
