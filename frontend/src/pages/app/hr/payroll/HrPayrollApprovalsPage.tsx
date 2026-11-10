import { useCallback, useEffect, useState } from "react";
import { api, type HrPayrollRunResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { logApiError } from "@/utils/logApiError";

/** Runs waiting for a manager decision (approval records only exist after a decision). */
const AWAITING_STATUSES = ["FINALIZED", "CHECKED"] as const;

export function HrPayrollApprovalsPage() {
  const [rows, setRows] = useState<HrPayrollRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const pages = await Promise.all(
        AWAITING_STATUSES.map((s) => api.listHrPayrollRuns({ status_filter: s })),
      );
      setRows(pages.flat().sort((a, b) => b.id - a.id));
    } catch (err) {
      logApiError("HrPayrollApprovalsPage.load", err);
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (run: HrPayrollRunResponse, decision: "approve" | "reject"): Promise<void> => {
    if (busyId != null) return;
    let note: string | null = null;
    if (decision === "reject") {
      const entered = window.prompt("Reason for rejecting this payroll run:", "");
      if (entered == null) return;
      note = entered.trim() || null;
    }
    setBusyId(run.id);
    setError("");
    try {
      if (decision === "approve") await api.approveHrPayrollRun(run.id);
      else await api.rejectHrPayrollRun(run.id, { note });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save approval decision");
    } finally {
      setBusyId(null);
    }
  };

  const money = (v: string) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const columns: HrTableColumn<HrPayrollRunResponse>[] = [
    { key: "run", header: "Run", render: (r) => <span className="font-medium text-text-primary">{r.run_code}</span>, value: (r) => r.run_code },
    { key: "date", header: "Run date", render: (r) => r.run_date, value: (r) => r.run_date },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    { key: "gross", header: "Gross", align: "right", render: (r) => <span className="tabular-nums">{money(r.gross_total)}</span>, value: (r) => r.gross_total },
    { key: "deductions", header: "Deductions", align: "right", hideOnMobile: true, render: (r) => <span className="tabular-nums">{money(r.deduction_total)}</span>, value: (r) => r.deduction_total },
    { key: "net", header: "Net", align: "right", render: (r) => <span className="tabular-nums font-semibold">{money(r.net_total)}</span>, value: (r) => r.net_total },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader title="Payroll Approvals" description="Finalized payroll runs waiting for a manager decision." />
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No payroll runs are waiting for approval"
        emptyHint="A run appears here after it is finalized on the Runs tab."
        statusOf={(r) => r.status}
        rowActions={(run) => [
          { key: "approve", label: busyId === run.id ? "Working…" : "Approve", primary: true, tone: "positive", disabled: busyId != null, onClick: () => void decide(run, "approve") },
          { key: "reject", label: "Reject", primary: true, disabled: busyId != null, onClick: () => void decide(run, "reject") },
        ]}
      />
    </div>
  );
}
