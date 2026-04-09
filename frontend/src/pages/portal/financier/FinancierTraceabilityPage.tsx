import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type RepaymentSummary = {
  schedule_lines?: number;
  paid_emi_total_approx?: number;
  next_due?: string | null;
};

type TraceItem = {
  utilization_id: number;
  summary?: RepaymentSummary | null;
  has_btb?: boolean;
};

export function FinancierTraceabilityPage() {
  const [data, setData] = useState<{ items?: TraceItem[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setData((await financierPortalApi.traceabilityList()) as { items?: TraceItem[] });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Traceability</h1>
        <p className="mt-1 text-sm text-text-muted">
          Funds → procurement → shipments → repayment, per facility utilization.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          No utilizations linked to your financier party, or nothing to show yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((it) => {
            const s = it.summary;
            return (
              <li key={it.utilization_id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="text-base font-semibold text-brand-primary hover:underline"
                    to={`/portal/financier/traceability/${it.utilization_id}`}
                  >
                    Utilization #{it.utilization_id}
                  </Link>
                  {it.has_btb ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      BTB linked
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium uppercase text-text-muted">
                      No BTB
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-text-muted">Schedule lines</dt>
                    <dd className="font-medium tabular-nums text-text-primary">{s?.schedule_lines ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Paid EMI (approx.)</dt>
                    <dd className="font-medium tabular-nums text-text-primary">
                      {s?.paid_emi_total_approx != null ? s.paid_emi_total_approx.toLocaleString() : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Next due</dt>
                    <dd className="font-medium text-text-primary">{s?.next_due ?? "—"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs">
                  <Link to={`/portal/financier/traceability/${it.utilization_id}`} className="text-brand-primary hover:underline">
                    View full chain →
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
