import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type Row = {
  order_id: number;
  order_code: string;
  buyer_name: string | null;
  outstanding_principal: number | null;
  proceeds_proxy: number | null;
  coverage_ratio: number | null;
  recovery_score: number | null;
  recovery_band: string | null;
  drivers: string[];
  finance_currency: string | null;
};

function bandClass(band: string | null) {
  const b = (band ?? "").toLowerCase();
  if (b === "strong") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (b === "adequate") return "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
  if (b === "watch") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (b === "at_risk") return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
  return "bg-surface-subtle text-text-muted";
}

export function FinancierRecoveryOutlookPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.recoveryOutlook();
        setItems((d.items as Row[]) ?? []);
        setNote(typeof d.note === "string" ? d.note : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Recovery outlook</h1>
        <p className="mt-1 text-xs text-text-muted">
          Estimated export proceeds vs outstanding principal for your financed orders. Coverage ratio above 1.0 means
          proceeds proxy exceeds loan outstanding.
        </p>
      </div>
      {note ? <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-muted">{note}</p> : null}
      {items.length === 0 && !note ? <p className="text-sm text-text-muted">No rows.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className={listTableHeadCellClass}>Order</th>
              <th className={listTableHeadCellClass}>Buyer</th>
              <th className={listTableHeadCellClass}>Outstanding</th>
              <th className={listTableHeadCellClass}>Proceeds proxy</th>
              <th className={listTableHeadCellClass}>Coverage</th>
              <th className={listTableHeadCellClass}>Score</th>
              <th className={listTableHeadCellClass}>Band</th>
              <th className={listTableHeadCellClass}>Drivers</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.order_id} className={listTableRowClass}>
                <td className="px-2 py-2">
                  <Link
                    to={`/portal/financier/orders/${r.order_id}?tab=finance`}
                    className="font-medium text-brand-primary hover:underline"
                  >
                    {r.order_code}
                  </Link>
                </td>
                <td className="px-2 py-2">{r.buyer_name ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">
                  {r.outstanding_principal != null
                    ? `${r.outstanding_principal.toLocaleString()} ${r.finance_currency ?? ""}`.trim()
                    : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums">
                  {r.proceeds_proxy != null
                    ? `${r.proceeds_proxy.toLocaleString()} ${r.finance_currency ?? ""}`.trim()
                    : "—"}
                </td>
                <td className="px-2 py-2 tabular-nums">{r.coverage_ratio != null ? r.coverage_ratio.toFixed(2) : "—"}</td>
                <td className="px-2 py-2 tabular-nums">{r.recovery_score ?? "—"}</td>
                <td className="px-2 py-2">
                  <span className={`rounded px-1.5 py-0.5 capitalize ${bandClass(r.recovery_band)}`}>
                    {(r.recovery_band ?? "—").replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-2 py-2 text-text-muted">{(r.drivers ?? []).slice(0, 2).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
