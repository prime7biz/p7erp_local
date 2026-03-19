import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  api,
  type ShipmentRow,
  type TradeCaseMarginResponse,
  type TradeCaseRow,
  type TradeCaseStageLogRow,
  type TradeCaseStageRow,
  type TradeDocumentRow,
} from "@/api/client";

export function TradeCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const id = Number(caseId || 0);

  const [item, setItem] = useState<TradeCaseRow | null>(null);
  const [stages, setStages] = useState<TradeCaseStageRow[]>([]);
  const [stageLog, setStageLog] = useState<TradeCaseStageLogRow[]>([]);
  const [docs, setDocs] = useState<TradeDocumentRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [margin, setMargin] = useState<TradeCaseMarginResponse | null>(null);
  const [nextStage, setNextStage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDocType, setNewDocType] = useState("PI");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [tradeCase, stageRows, stageLogs, docsRows, shipmentRows, marginRes] = await Promise.all([
        api.getTradeCase(id),
        api.getTradeCaseStages(id),
        api.getTradeCaseStageLog(id),
        api.listTradeDocuments(id),
        api.listShipments({ trade_case_id: id }),
        api.getTradeCaseMargin(id),
      ]);
      setItem(tradeCase);
      setStages(stageRows);
      setStageLog(stageLogs);
      setDocs(docsRows);
      setShipments(shipmentRows);
      setMargin(marginRes);
      const selected = stageRows.find((s) => s.stage_key === tradeCase.current_stage);
      const next = (selected?.next_stage_keys || [])[0];
      setNextStage(next || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trade case");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingForNext = useMemo(() => {
    if (!nextStage) return [];
    const stage = stages.find((s) => s.stage_key === nextStage);
    const required = (stage?.required_doc_types || []).map((d) => String(d).toUpperCase());
    const have = new Set(docs.map((d) => String(d.document_type).toUpperCase()));
    return required.filter((r) => !have.has(r));
  }, [stages, docs, nextStage]);

  if (loading) return <div className="p-6 text-sm text-text-muted">Loading trade case...</div>;
  if (!item) return <div className="p-6 text-sm text-status-danger">{error || "Trade case not found."}</div>;

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/app/trade/cases"
          className="mb-2 inline-block text-sm text-text-secondary hover:text-text-primary"
        >
          ← Back to Trade Cases
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Trade Case {item.reference}</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {item.direction} · Status {item.status} · Current stage {item.current_stage}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Order</p>
          <p className="mt-1 text-sm text-text-primary">
            {item.order_id ? (
              <Link to={`/app/orders/${item.order_id}`} className="text-brand-primary hover:underline">
                #{item.order_id}
              </Link>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-text-muted">Proforma Invoice</p>
          <p className="mt-1 text-sm text-text-primary">
            {item.proforma_invoice_id ? (
              <Link to={`/app/commercial/proforma-invoices/${item.proforma_invoice_id}/edit`} className="text-brand-primary hover:underline">
                #{item.proforma_invoice_id}
              </Link>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-text-muted">BTB LC</p>
          <p className="mt-1 text-sm text-text-primary">{item.btb_lc_id ? `#${item.btb_lc_id}` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">ETD / ETA</p>
          <p className="mt-1 text-sm text-text-primary">
            {item.etd ? new Date(item.etd).toLocaleDateString() : "—"} / {item.eta ? new Date(item.eta).toLocaleDateString() : "—"}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-text-muted">Amount</p>
          <p className="mt-1 text-sm text-text-primary">
            {item.amount != null ? Number(item.amount).toLocaleString() : "—"} {item.currency || ""}
          </p>
        </div>
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10/60 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Estimated Margin</p>
          <p className="mt-1 text-sm text-text-primary">
            {(margin?.margin_amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ({(margin?.margin_pct ?? 0).toFixed(2)}%)
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Revenue: {(margin?.amount ?? 0).toLocaleString()} · Cost: {(margin?.estimated_cost ?? 0).toLocaleString()}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle px-4 py-2">
          <h2 className="text-sm font-semibold text-text-primary">Stage Transition</h2>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={nextStage}
              onChange={(e) => setNextStage(e.target.value)}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            >
              <option value="">Select target stage</option>
              {stages.map((s) => (
                <option key={s.id} value={s.stage_key}>
                  {s.stage_key}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!nextStage || transitioning}
              onClick={async () => {
                if (!nextStage) return;
                setTransitioning(true);
                setError("");
                try {
                  const updated = await api.transitionTradeCase(id, { to_stage: nextStage });
                  setItem(updated);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Transition failed");
                } finally {
                  setTransitioning(false);
                }
              }}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {transitioning ? "Transitioning..." : "Move Stage"}
            </button>
          </div>
          {nextStage && missingForNext.length > 0 && (
            <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
              Missing docs for {nextStage}: {missingForNext.join(", ")}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-surface-subtle text-text-secondary">
                <tr>
                  <th className="px-2 py-1.5 text-left">From</th>
                  <th className="px-2 py-1.5 text-left">To</th>
                  <th className="px-2 py-1.5 text-left">When</th>
                  <th className="px-2 py-1.5 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageLog.map((log) => (
                  <tr key={log.id}>
                    <td className="px-2 py-1.5">{log.from_stage ?? "—"}</td>
                    <td className="px-2 py-1.5">{log.to_stage}</td>
                    <td className="px-2 py-1.5">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-2 py-1.5">{log.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-4 py-2">
            <h2 className="text-sm font-semibold text-text-primary">Shipments</h2>
            <Link
              to={`/app/logistics?trade_case_id=${id}`}
              className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
            >
              View in Logistics
            </Link>
          </div>
          {shipments.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">No shipments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-surface-subtle text-text-secondary">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Reference</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                    <th className="px-2 py-1.5 text-left">Carrier</th>
                    <th className="px-2 py-1.5 text-left">ETD/ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shipments.map((s) => (
                    <tr key={s.id}>
                      <td className="px-2 py-1.5">{s.reference}</td>
                      <td className="px-2 py-1.5">{s.status}</td>
                      <td className="px-2 py-1.5">{s.carrier || "—"}</td>
                      <td className="px-2 py-1.5">
                        {(s.etd && new Date(s.etd).toLocaleDateString()) || "—"} / {(s.eta && new Date(s.eta).toLocaleDateString()) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border bg-surface-subtle px-4 py-2">
            <h2 className="text-sm font-semibold text-text-primary">Documents</h2>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
              >
                <option value="PI">PI</option>
                <option value="LC">LC</option>
                <option value="INVOICE">INVOICE</option>
                <option value="PACKING_LIST">PACKING_LIST</option>
                <option value="BL">BL</option>
                <option value="COO">COO</option>
                <option value="BOOKING_CONFIRM">BOOKING_CONFIRM</option>
              </select>
              <input
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setError("");
                  try {
                    await api.uploadTradeDocument(id, { file, document_type: newDocType });
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setUploading(false);
                    e.currentTarget.value = "";
                  }
                }}
                className="text-xs"
              />
              {uploading && <span className="text-xs text-text-muted">Uploading...</span>}
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-text-muted">No documents uploaded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-surface-subtle text-text-secondary">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Type</th>
                      <th className="px-2 py-1.5 text-left">File</th>
                      <th className="px-2 py-1.5 text-left">Version</th>
                      <th className="px-2 py-1.5 text-left">Uploaded</th>
                      <th className="px-2 py-1.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td className="px-2 py-1.5">{d.document_type}</td>
                        <td className="px-2 py-1.5">{d.file_name}</td>
                        <td className="px-2 py-1.5">{d.version}</td>
                        <td className="px-2 py-1.5">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              const blob = await api.downloadTradeDocument(id, d.id);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = d.file_name;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
