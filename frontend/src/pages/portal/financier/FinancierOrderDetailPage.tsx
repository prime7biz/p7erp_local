import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Badge } from "@/components/ui/badge";
import { OrderPipelineRibbon } from "./components/OrderPipelineRibbon";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type Tab = "overview" | "production" | "finance" | "materials";

function stageBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (s.includes("progress") || s.includes("review")) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-surface-subtle text-text-muted";
}

function bandClass(band: string | null | undefined) {
  const b = (band ?? "").toLowerCase();
  if (b === "strong") return "text-emerald-700 dark:text-emerald-300";
  if (b === "adequate") return "text-sky-700 dark:text-sky-300";
  if (b === "watch") return "text-amber-700 dark:text-amber-300";
  if (b === "at_risk") return "text-red-700 dark:text-red-300";
  return "text-text-muted";
}

export function FinancierOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const id = Number(orderId);
  const initialTab = (searchParams.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [o, setO] = useState<Record<string, unknown> | null>(null);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [documentsNote, setDocumentsNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.orderDetail(id, { includeProductionDetail: true });
        if (ok) {
          setO(x);
          const docs = await financierPortalApi.orderDocuments(id).catch(() => null);
          if (docs) {
            setDocuments((docs.items as Record<string, unknown>[]) ?? []);
            setDocumentsNote(docs.note ?? null);
          }
        }
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Not found");
      }
    })();
    return () => {
      ok = false;
    };
  }, [id]);

  if (!Number.isFinite(id)) return <PortalErrorState message="Invalid order" />;
  if (err) return <PortalErrorState message={err} />;
  if (!o) return <p className="text-sm text-text-muted">Loading…</p>;

  const pipeline = o.pipeline as { pipeline_status?: string; steps?: { name: string; status: string }[] } | undefined;
  const production = o.production as Record<string, unknown> | undefined;
  const finance = o.finance as Record<string, unknown> | undefined;
  const recovery = o.recovery as Record<string, unknown> | undefined;
  const commercial = o.commercial as Record<string, unknown> | undefined;
  const trade = o.trade as Record<string, unknown> | undefined;
  const rawMaterials = (o.raw_materials as Record<string, unknown>[]) ?? [];
  const prodDetail = o.production_detail as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      <Link to="/portal/financier/order-book" className="text-sm text-brand-primary hover:underline">
        ← Order book
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-text-primary">{String(o.order_code)}</h1>
        <Badge variant="secondary">{String(o.status)}</Badge>
        {pipeline?.pipeline_status ? <Badge variant="info">{pipeline.pipeline_status}</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["overview", "Overview"],
            ["production", "Production"],
            ["finance", "Finance & recovery"],
            ["materials", "Materials"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === k ? "bg-brand-primary/10 text-brand-primary" : "text-text-muted hover:bg-surface-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4 text-sm space-y-1 text-text-muted">
            <p>Buyer: {o.buyer_name ? String(o.buyer_name) : "—"}</p>
            <p>Quantity: {o.quantity != null ? String(o.quantity) : "—"}</p>
            <p>Order date: {o.order_date ? String(o.order_date) : "—"}</p>
            <p>Delivery: {o.delivery_date ? String(o.delivery_date) : "—"}</p>
          </div>
          {pipeline?.steps?.length ? (
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Pipeline</h2>
              <OrderPipelineRibbon steps={pipeline.steps} />
            </div>
          ) : null}
          {trade ? (
            <div className="rounded-xl border border-border p-4 text-sm">
              <h2 className="font-semibold text-text-primary">Export path</h2>
              <p className="mt-1 text-text-muted">
                Trade stage: {String(trade.current_stage ?? "—")} · Docs: {String(trade.document_count ?? 0)}
              </p>
              {trade.shipment_etd ? <p className="text-text-muted">Shipment ETD: {String(trade.shipment_etd)}</p> : null}
              {trade.fx_receipt_status ? (
                <p className="text-text-muted">FX receipt: {String(trade.fx_receipt_status)}</p>
              ) : null}
            </div>
          ) : null}
          {documents.length > 0 ? (
            <div className="rounded-xl border border-border p-4 text-sm">
              <h2 className="font-semibold text-text-primary">Trade documents</h2>
              <ul className="mt-2 space-y-1 text-text-muted">
                {documents.map((d) => (
                  <li key={String(d.id)}>
                    {String(d.document_type ?? "doc")}: {String(d.file_name ?? "—")}
                  </li>
                ))}
              </ul>
            </div>
          ) : documentsNote ? (
            <p className="text-xs text-text-muted">{documentsNote}</p>
          ) : null}
        </div>
      ) : null}

      {tab === "production" && production ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Cutting", production.cutting_status, production.cutting_pct],
                ["Sewing", production.sewing_status, production.sewing_pct],
                ["Finishing", production.finishing_status, production.finishing_pct],
                ["Inspection", production.inspection_status, production.inspection_pass_rate],
              ] as const
            ).map(([label, status, pct]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <p className="text-xs text-text-muted">{label}</p>
                <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${stageBadge(String(status ?? ""))}`}>
                  {String(status ?? "—")} {pct != null ? `${pct}%` : ""}
                </span>
              </div>
            ))}
          </div>
          {prodDetail?.sewing_daily_last_14d ? (
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary">Sewing output (last 14 days)</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {((prodDetail.sewing_daily_last_14d as { date: string; good_qty: number }[]) ?? []).map((d) => (
                  <div key={d.date} className="rounded border border-border px-2 py-1 text-[10px]">
                    <span className="text-text-muted">{d.date.slice(5)}</span>{" "}
                    <span className="font-medium tabular-nums">{d.good_qty}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {prodDetail?.line_bookings ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className={listTableHeadCellClass}>Line</th>
                    <th className={listTableHeadCellClass}>Status</th>
                    <th className={listTableHeadCellClass}>Planned end</th>
                    <th className={listTableHeadCellClass}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {((prodDetail.line_bookings as Record<string, unknown>[]) ?? []).map((lb, i) => (
                    <tr key={i} className={listTableRowClass}>
                      <td className="px-2 py-2">{String(lb.line_code ?? "—")}</td>
                      <td className="px-2 py-2">{String(lb.reservation_status ?? "—")}</td>
                      <td className="px-2 py-2">{String(lb.planned_end_date ?? "—")}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {String(lb.completed_qty ?? 0)} / {String(lb.planned_qty ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="space-y-4">
          {finance ? (
            <div className="rounded-xl border border-border p-4 text-sm space-y-1">
              <p>
                FOB: {finance.fob_value != null ? String(finance.fob_value) : "—"} {String(finance.fob_currency ?? "")}
              </p>
              <p>
                Approved: {String(finance.approved_finance_amount ?? "—")} {String(finance.finance_currency ?? "")}
              </p>
              <p>
                Outstanding: {String(finance.outstanding_finance_amount ?? "—")}{" "}
                {String(finance.finance_currency ?? "")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">No finance data for this order.</p>
          )}
          {recovery ? (
            <div className="rounded-xl border border-border p-4 text-sm">
              <h3 className="font-semibold text-text-primary">Recovery outlook</h3>
              <p className={`mt-1 font-medium capitalize ${bandClass(recovery.recovery_band as string)}`}>
                Band: {String(recovery.recovery_band ?? "—").replace(/_/g, " ")} · Score:{" "}
                {String(recovery.recovery_score ?? "—")}
              </p>
              <p className="text-text-muted">
                Coverage: {recovery.coverage_ratio != null ? String(recovery.coverage_ratio) : "—"} · Proceeds proxy:{" "}
                {recovery.proceeds_proxy != null ? String(recovery.proceeds_proxy) : "—"}
              </p>
            </div>
          ) : null}
          {commercial ? (
            <div className="rounded-xl border border-border p-4 text-sm text-text-muted">
              <p>RM received: {commercial.rm_received_pct != null ? `${commercial.rm_received_pct}%` : "—"}</p>
              <p>PI issued: {commercial.pi_issued_at ? String(commercial.pi_issued_at) : "—"}</p>
              <p>LC received: {commercial.lc_received_at ? String(commercial.lc_received_at) : "—"}</p>
            </div>
          ) : null}
          <Link to="/portal/financier/traceability" className="text-sm text-brand-primary hover:underline">
            View traceability chain →
          </Link>
        </div>
      ) : null}

      {tab === "materials" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          {rawMaterials.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">No raw material lines for this order.</p>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={listTableHeadCellClass}>Item</th>
                  <th className={listTableHeadCellClass}>Ordered</th>
                  <th className={listTableHeadCellClass}>Received</th>
                  <th className={listTableHeadCellClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rawMaterials.map((r, i) => (
                  <tr key={i} className={listTableRowClass}>
                    <td className="px-2 py-2">{String(r.item_code ?? r.item_name ?? "—")}</td>
                    <td className="px-2 py-2 tabular-nums">{String(r.qty_ordered ?? "—")}</td>
                    <td className="px-2 py-2 tabular-nums">{String(r.qty_received ?? "—")}</td>
                    <td className="px-2 py-2">{String(r.in_house_status ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
