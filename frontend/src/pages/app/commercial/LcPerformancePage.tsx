/**
 * LC performance (Akij-style LC dashboard): one view of LC value, shipped, realised, outstanding
 * and BTB opened per master export LC / sales contract, with expiry and BTB-limit warnings.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type LcPerformanceFlag, type LcPerformanceResponse, type LcPerformanceRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { listPageRootClass, listPageTableCardClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";

const FLAG_LABEL: Record<LcPerformanceFlag, { text: string; tone: string }> = {
  EXPIRED_UNSHIPPED: { text: "Expired, not fully shipped", tone: "bg-status-danger-subtle text-status-danger-foreground" },
  EXPIRING_UNSHIPPED: { text: "Expires ≤ 30 days", tone: "bg-status-warning-subtle text-status-warning-foreground" },
  OVER_SHIPPED: { text: "Shipped above LC value", tone: "bg-status-danger-subtle text-status-danger-foreground" },
  BTB_ABOVE_75PCT: { text: "BTB > 75% of LC", tone: "bg-status-warning-subtle text-status-warning-foreground" },
};

const money = (v: string | number) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Bar({ pct }: { pct: number | null }) {
  const w = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-surface-subtle" aria-hidden>
      <div className="h-full bg-brand-primary" style={{ width: `${w}%` }} />
    </div>
  );
}

export function LcPerformancePage() {
  const [data, setData] = useState<LcPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);

  useEffect(() => {
    api
      .getLcPerformance()
      .then(setData)
      .catch((e) => {
        logApiError("LcPerformancePage.load", e);
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !onlyAtRisk || r.flags.length > 0), [data, onlyAtRisk]);
  const atRisk = (data?.rows ?? []).filter((r) => r.flags.length > 0).length;

  const columns = useMemo<GridColumn<LcPerformanceRow>[]>(
    () => [
      {
        id: "reference",
        header: "LC / contract",
        alwaysVisible: true,
        value: (r) => r.reference,
        cell: (r) => (
          <div>
            <Link className="font-medium text-brand-primary hover:underline" to="/app/commercial/master-contracts">
              {r.reference}
            </Link>
            <div className="text-xs text-text-muted">{[r.lc_number, r.buyer_name].filter(Boolean).join(" · ") || r.contract_type}</div>
          </div>
        ),
      },
      { id: "currency", header: "Cur.", value: (r) => r.currency, cell: (r) => r.currency },
      { id: "lc_value", header: "LC value", align: "right", value: (r) => Number(r.lc_value), cell: (r) => money(r.lc_value) },
      {
        id: "shipped",
        header: "Shipped",
        align: "right",
        value: (r) => Number(r.shipped),
        cell: (r) => (
          <div className="flex flex-col items-end">
            <span>
              {money(r.shipped)} <span className="text-xs text-text-muted">{r.shipped_pct != null ? `${r.shipped_pct}%` : ""}</span>
            </span>
            <Bar pct={r.shipped_pct} />
          </div>
        ),
      },
      {
        id: "realised",
        header: "Realised",
        align: "right",
        value: (r) => Number(r.realised),
        cell: (r) => (
          <div className="text-right">
            {money(r.realised)}
            {Number(r.realisation_pending) > 0 ? <div className="text-xs text-text-muted">+{money(r.realisation_pending)} awaiting posting</div> : null}
          </div>
        ),
      },
      { id: "outstanding", header: "Shipped, not realised", align: "right", value: (r) => Number(r.outstanding), cell: (r) => money(r.outstanding) },
      { id: "unshipped", header: "Left to ship", align: "right", value: (r) => Number(r.unshipped), cell: (r) => money(r.unshipped) },
      {
        id: "btb",
        header: "BTB opened",
        align: "right",
        value: (r) => Number(r.btb_opened),
        cell: (r) => (
          <div className="text-right">
            {money(r.btb_opened)}
            <div className="text-xs text-text-muted">
              {r.btb_count} LC{r.btb_count === 1 ? "" : "s"}
              {r.btb_pct_of_lc != null ? ` · ${r.btb_pct_of_lc}%` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "expiry",
        header: "Expiry",
        value: (r) => r.expiry_date ?? "",
        cell: (r) => (
          <div>
            {r.expiry_date ?? "—"}
            {r.days_to_expiry != null ? (
              <div className={`text-xs ${r.days_to_expiry < 0 ? "text-status-danger-foreground" : "text-text-muted"}`}>
                {r.days_to_expiry < 0 ? `${-r.days_to_expiry} days ago` : `${r.days_to_expiry} days left`}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "flags",
        header: "Watch",
        value: (r) => r.flags.join(" "),
        cell: (r) =>
          r.flags.length === 0 ? (
            <span className="text-xs text-status-success-foreground">On track</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {r.flags.map((f) => (
                <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FLAG_LABEL[f]?.tone ?? ""}`}>
                  {FLAG_LABEL[f]?.text ?? f}
                </span>
              ))}
            </div>
          ),
      },
    ],
    [],
  );

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="LC performance"
        description="For every export LC / sales contract: how much is shipped, how much money has come in, what is still outstanding, and BTB opened against it."
      />
      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.totals_by_currency ?? []).map((t) => (
          <div key={t.currency} className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <div className="text-xs font-medium text-text-muted">{t.currency} — all open LCs</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">{money(t.lc_value)}</div>
            <div className="mt-1 text-xs text-text-secondary">
              Shipped {money(t.shipped)} · Realised {money(t.realised)}
              <br />
              Outstanding {money(t.outstanding)} · Left to ship {money(t.unshipped)}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
          <div className="text-xs font-medium text-text-muted">Needs attention</div>
          <div className={`mt-1 text-lg font-semibold ${atRisk ? "text-status-danger-foreground" : "text-text-primary"}`}>{atRisk}</div>
          <label className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={onlyAtRisk} onChange={(e) => setOnlyAtRisk(e.target.checked)} />
            Show only these
          </label>
        </div>
      </div>

      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="commercial.lc_performance"
          exportName="lc-performance"
          columns={columns}
          rows={rows}
          getRowId={(r) => String(r.master_contract_id)}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No open export LCs or sales contracts.</p>}
        />
      </div>
      <p className="text-xs text-text-muted">
        Shipped = issued commercial invoices on the LC's orders. Realised = posted receipts allocated to those invoices (shared by invoice
        value when an invoice covers several LCs). Amounts are in each LC's currency.
      </p>
    </div>
  );
}
