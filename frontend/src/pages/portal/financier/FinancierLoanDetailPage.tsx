import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type ScheduleRow = {
  installment?: number;
  due_date?: string;
  emi?: number;
  status?: string;
};

function scheduleRowClass(status: string | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return `${listTableRowClass} bg-emerald-50 dark:bg-emerald-950/25`;
  if (s === "due" || s === "partially_paid") return `${listTableRowClass} bg-amber-50 dark:bg-amber-950/25`;
  if (s === "overdue") return `${listTableRowClass} bg-red-50 dark:bg-red-950/25`;
  return `${listTableRowClass} bg-surface-subtle/60`;
}

function statusBadge(status: string | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (s === "due" || s === "partially_paid") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (s === "overdue") return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
  return "bg-surface-subtle text-text-muted";
}

export function FinancierLoanDetailPage() {
  const { utilizationId } = useParams<{ utilizationId: string }>();
  const id = Number(utilizationId);
  const [data, setData] = useState<{
    utilization?: Record<string, unknown>;
    schedule?: ScheduleRow[];
  } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      try {
        setData((await financierPortalApi.loanPortfolioDetail(id)) as typeof data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [id]);

  if (!Number.isFinite(id)) return <PortalErrorState message="Invalid id" />;
  if (err) return <PortalErrorState message={err} />;
  if (!data) return <p className="text-sm text-text-muted">Loading…</p>;

  const u = data.utilization;
  const sched = data.schedule ?? [];

  return (
    <div className="space-y-6">
      <Link to="/portal/financier/loan-portfolio" className="text-sm text-brand-primary hover:underline">
        ← Portfolio
      </Link>
      <h1 className="text-lg font-semibold text-text-primary">Utilization detail</h1>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-muted">Utilization</p>
            <p className="text-xl font-semibold text-text-primary">{u?.code != null ? String(u.code) : `#${u?.id ?? id}`}</p>
          </div>
          {u?.status != null ? (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge(String(u.status))}`}>
              {String(u.status)}
            </span>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-text-muted">Principal</dt>
            <dd className="text-lg font-medium tabular-nums">{Number(u?.principal ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Outstanding principal</dt>
            <dd className="text-lg font-medium tabular-nums">{Number(u?.outstanding_principal ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Repayment schedule</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr>
                <th className={listTableHeadCellClass}>#</th>
                <th className={listTableHeadCellClass}>Due</th>
                <th className={listTableHeadCellClass}>EMI</th>
                <th className={listTableHeadCellClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sched.map((r) => (
                <tr key={String(r.installment)} className={scheduleRowClass(r.status)}>
                  <td className="px-2 py-2 tabular-nums">{r.installment ?? "—"}</td>
                  <td className="px-2 py-2">{r.due_date ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{r.emi != null ? r.emi.toLocaleString() : "—"}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                      {r.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Row colors: green = paid, amber = due / partial, red = overdue, gray = upcoming.
        </p>
      </div>
    </div>
  );
}
