import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type ConsumptionReconciliationResponse,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
  type OrderResponse,
  type ProductionMaterialIssueResponse,
} from "@/api/client";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

function formatMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ConsumptionControlPage() {
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof api.getConsumptionSnapshot>> | null>(null);
  const [reservations, setReservations] = useState<Awaited<ReturnType<typeof api.getConsumptionReservations>>>([]);
  const [issueItemId, setIssueItemId] = useState<number>(0);
  const [issueQty, setIssueQty] = useState<string>("0");
  const [issueWarehouseId, setIssueWarehouseId] = useState<number>(0);
  const [issueRemarks, setIssueRemarks] = useState<string>("");
  const [issueBomLineId, setIssueBomLineId] = useState<number | "">("");
  const [warehouses, setWarehouses] = useState<Awaited<ReturnType<typeof api.listWarehouses>>>([]);
  const [changeRequests, setChangeRequests] = useState<Awaited<ReturnType<typeof api.listConsumptionChangeRequests>>>([]);
  const [crType, setCrType] = useState("QUANTITY_INCREASE");
  const [crReason, setCrReason] = useState("");
  const [crItems, setCrItems] = useState<Array<{ planItemId: number; newQty: string; reason: string }>>([]);
  const [crFilter, setCrFilter] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [expandedCrId, setExpandedCrId] = useState<number | null>(null);
  const [kpi, setKpi] = useState({ openPo: 0, openGrn: 0, pendingCr: 0, lowStock: 0 });
  const [prevKpi, setPrevKpi] = useState<{ openPo: number; openGrn: number; pendingCr: number; lowStock: number } | null>(null);
  const [error, setError] = useState("");
  const [layerRecon, setLayerRecon] = useState<ConsumptionReconciliationResponse | null>(null);
  const [materialVar, setMaterialVar] = useState<Record<string, unknown> | null>(null);
  const [pmiForOrder, setPmiForOrder] = useState<ProductionMaterialIssueResponse[]>([]);
  const [pmiStage, setPmiStage] = useState("CUTTING");
  const [pmiCovered, setPmiCovered] = useState(1);
  const [pmiBomId, setPmiBomId] = useState<number | "">("");
  const [pmiLines, setPmiLines] = useState<{ bom_line_id: number; actual_issue_qty: string }[]>([
    { bom_line_id: 0, actual_issue_qty: "1" },
  ]);
  const [pmiSaving, setPmiSaving] = useState(false);
  const [pmiPrintOpen, setPmiPrintOpen] = useState(false);
  const [pmiPrintData, setPmiPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [pmiPrintTitle, setPmiPrintTitle] = useState("");
  const [pmiPrintCopy, setPmiPrintCopy] = useState(1);
  const [pmiPrintTpl, setPmiPrintTpl] = useState<"standard" | "compact" | "audit">("standard");
  const [pmiPostOpen, setPmiPostOpen] = useState(false);
  const [pmiPostRows, setPmiPostRows] = useState<InventoryGlPostingDetail[]>([]);
  const [pmiPostTitle, setPmiPostTitle] = useState("");

  const crStatusBadgeClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === "PENDING") return "bg-status-warning-subtle text-status-warning-foreground";
    if (s === "APPROVED") return "bg-status-success-subtle text-status-success-foreground";
    if (s === "REJECTED") return "bg-status-danger-subtle text-status-danger-foreground";
    return "bg-surface-subtle text-text-secondary";
  };
  const trend = (key: keyof typeof kpi) => {
    if (!prevKpi) return "";
    if (kpi[key] > prevKpi[key]) return "↑";
    if (kpi[key] < prevKpi[key]) return "↓";
    return "→";
  };

  const loadOrders = useCallback(async () => {
    try {
      const rows = await api.listOrders({ limit: 100 });
      setOrders(rows);
      setSelectedOrderId((prev) => (!prev && rows[0] ? rows[0].id : prev));
      const whRows = await api.listWarehouses();
      setWarehouses(whRows);
      setIssueWarehouseId((prev) => (!prev && whRows[0] ? whRows[0].id : prev));
      const [overview, pendingCrRows, stockRows] = await Promise.all([
        api.getInventoryReconciliationOverview(),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
        api.getStockSummary(),
      ]);
      const nextKpi = {
        openPo: overview.purchase_orders_open,
        openGrn: overview.goods_receiving_open,
        pendingCr: pendingCrRows.length,
        lowStock: stockRows.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length,
      };
      const prevRaw = localStorage.getItem("p7_inventory_kpi_snapshot");
      if (prevRaw) {
        try {
          setPrevKpi(JSON.parse(prevRaw) as { openPo: number; openGrn: number; pendingCr: number; lowStock: number });
        } catch {
          setPrevKpi(null);
        }
      }
      setKpi(nextKpi);
      localStorage.setItem("p7_inventory_kpi_snapshot", JSON.stringify(nextKpi));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    }
  }, []);

  const loadSnapshot = useCallback(async (orderId: number) => {
    if (!orderId) return;
    try {
      const [snap, resv, recon, variance, pmiAll] = await Promise.all([
        api.getConsumptionSnapshot(orderId),
        api.getConsumptionReservations(orderId),
        api.getConsumptionReconciliation(orderId, { tolerance_pct: 5 }).catch(() => null),
        api.getOrderMaterialVariance(orderId).catch(() => null),
        api.listProductionMaterialIssues({ limit: 200 }).catch(() => []),
      ]);
      setSnapshot(snap);
      setReservations(resv);
      setLayerRecon(recon);
      setMaterialVar(variance && typeof variance === "object" ? (variance as Record<string, unknown>) : null);
      setPmiForOrder((pmiAll as ProductionMaterialIssueResponse[]).filter((p) => p.order_id === orderId));
      if (variance && typeof variance === "object" && (variance as { ok?: boolean }).ok && "bom_id" in variance) {
        const bid = (variance as { bom_id: number }).bom_id;
        setPmiBomId((prev) => (prev === "" ? bid : prev));
      }
      if (resv[0]) setIssueItemId(resv[0].item_id);
      if (snap.items?.length) {
        setCrItems((prev) =>
          prev.length > 0
            ? prev
            : snap.items
                .slice(0, 1)
                .map((it) => ({ planItemId: Number(it.planItemId ?? 0), newQty: String(it.requiredQty ?? "0"), reason: "" })),
        );
      }
      const crRows = await api.listConsumptionChangeRequests({
        status_filter: crFilter || undefined,
        order_id: orderId,
      });
      setChangeRequests(crRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snapshot");
      setLayerRecon(null);
    }
  }, [crFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const orderIdFromUrl = searchParams.get("orderId");
  useEffect(() => {
    const oid = Number(orderIdFromUrl || 0);
    if (oid > 0) setSelectedOrderId(oid);
  }, [orderIdFromUrl]);

  useEffect(() => {
    const loadPermission = async () => {
      if (!me?.user_id) return;
      try {
        const users = await api.listUsers();
        const mine = users.find((u) => u.id === me.user_id);
        const role = (mine?.role_name ?? "").toLowerCase();
        setCanReview(role === "admin" || role === "manager");
      } catch {
        setCanReview(false);
      }
    };
    void loadPermission();
  }, [me?.user_id]);

  useEffect(() => {
    if (selectedOrderId) {
      void loadSnapshot(selectedOrderId);
    }
  }, [selectedOrderId, loadSnapshot]);

  const finalize = async () => {
    if (!selectedOrderId) return;
    try {
      await api.finalizeConsumptionOrder(selectedOrderId);
      await loadSnapshot(selectedOrderId);
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finalize order");
    }
  };

  const issueMaterial = async () => {
    if (!selectedOrderId || !issueItemId || !issueWarehouseId) return;
    try {
      await api.issueConsumptionMaterial({
        order_id: selectedOrderId,
        item_id: issueItemId,
        issue_qty: Number(issueQty),
        warehouse_id: issueWarehouseId,
        remarks: issueRemarks,
        bom_line_id: issueBomLineId === "" ? null : issueBomLineId,
      });
      setIssueQty("0");
      setIssueRemarks("");
      await loadSnapshot(selectedOrderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue material");
    }
  };

  const createChangeRequest = async () => {
    if (!selectedOrderId || !crReason.trim()) return;
    const payloadItems = crItems
      .filter((it) => it.planItemId > 0 && Number(it.newQty) > 0)
      .map((it) => ({ plan_item_id: it.planItemId, new_qty: it.newQty, reason: it.reason || undefined }));
    if (!payloadItems.length) {
      setError("Please add at least one valid item change.");
      return;
    }
    try {
      await api.createConsumptionChangeRequest({
        order_id: selectedOrderId,
        change_type: crType,
        reason: crReason,
        items: payloadItems,
      });
      setCrReason("");
      setCrItems([]);
      await loadSnapshot(selectedOrderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create change request");
    }
  };

  const addCrItem = () => {
    const first = snapshot?.items?.[0];
    setCrItems((prev) => [
      ...prev,
      {
        planItemId: Number(first?.planItemId ?? 0),
        newQty: String(first?.requiredQty ?? "0"),
        reason: "",
      },
    ]);
  };

  const updateCrItem = (idx: number, patch: Partial<{ planItemId: number; newQty: string; reason: string }>) => {
    setCrItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const removeCrItem = (idx: number) => {
    setCrItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const approveCR = async (id: number) => {
    try {
      await api.approveConsumptionChangeRequest(id, reviewReason || undefined);
      await loadSnapshot(selectedOrderId);
      setReviewReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve change request");
    }
  };

  const rejectCR = async (id: number) => {
    if (!reviewReason.trim()) {
      setError("Please provide review reason before rejecting.");
      return;
    }
    try {
      await api.rejectConsumptionChangeRequest(id, reviewReason);
      await loadSnapshot(selectedOrderId);
      setReviewReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject change request");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Consumption Control</h1>
        <p className="text-sm text-text-muted">Finalize order BOM snapshots and keep material usage controlled.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm"><div className="text-text-muted">Open PO</div><div className="text-xl font-semibold">{kpi.openPo} <span className="text-xs text-text-muted">{trend("openPo")}</span></div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm"><div className="text-text-muted">Open GRN</div><div className="text-xl font-semibold">{kpi.openGrn} <span className="text-xs text-text-muted">{trend("openGrn")}</span></div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm"><div className="text-text-muted">Pending CR</div><div className="text-xl font-semibold">{kpi.pendingCr} <span className="text-xs text-text-muted">{trend("pendingCr")}</span></div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm"><div className="text-text-muted">Low Stock Items</div><div className="text-xl font-semibold">{kpi.lowStock} <span className="text-xs text-text-muted">{trend("lowStock")}</span></div></div>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      {selectedOrderId > 0 && layerRecon && layerRecon.items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Quoted material cost</div>
            <div className="text-lg font-semibold">{formatMoney(layerRecon.summary.total_quoted_planned_cost)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">BOM planned cost</div>
            <div className="text-lg font-semibold">{formatMoney(layerRecon.summary.total_bom_planned_cost)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Actual cost</div>
            <div className="text-lg font-semibold">{formatMoney(layerRecon.summary.total_actual_cost)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Quoted ↔ BOM ↔ Actual</div>
            <div className="text-xs text-text-secondary">
              Δ Q↔B {formatMoney(layerRecon.summary.quoted_vs_bom_cost_variance)} · Δ all{" "}
              {formatMoney(layerRecon.summary.quoted_vs_actual_cost_variance)}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              BOM {layerRecon.bom_status ?? "—"} · Lines &gt;5% quoted↔BOM:{" "}
              {layerRecon.items.filter((i) => i.quoted_vs_bom_variance_pct != null && Math.abs(i.quoted_vs_bom_variance_pct) > 5).length}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select
            className="min-w-[260px] rounded border px-3 py-2 text-sm"
            value={String(selectedOrderId)}
            onChange={(e) => setSelectedOrderId(Number(e.target.value))}
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_code} | {o.style_ref ?? "No style"} | {o.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            onClick={() => void finalize()}
          >
            Finalize Order Snapshot
          </button>
          {selectedOrderId > 0 ? (
            <Link
              to={`/app/merchandising/consumption-reconciliation?orderId=${selectedOrderId}`}
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-brand-primary hover:bg-surface-subtle"
            >
              Open reconciliation
            </Link>
          ) : null}
        </div>
        <div className="rounded border border-border p-3 text-sm">
          <div className="mb-2 font-medium">Snapshot Status</div>
          <div className="text-text-secondary">{snapshot?.snapshot_locked ? "Locked" : "Open"}</div>
        </div>
      </div>

      {selectedOrderId > 0 && materialVar?.ok === true && Array.isArray(materialVar.lines) ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Material variance (BOM vs actual issues)</h2>
          <p className="mb-3 text-xs text-text-muted">
            From inventory API: quoted vs BOM vs actual issued qty tied to BOM lines (stock movements with order + bom_line).
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-2 py-2">BOM line</th>
                  <th className="px-2 py-2">Material</th>
                  <th className="px-2 py-2 text-right">BOM gross</th>
                  <th className="px-2 py-2 text-right">Actual issued</th>
                  <th className="px-2 py-2 text-right">BOM vs act %</th>
                </tr>
              </thead>
              <tbody>
                {(materialVar.lines as Array<Record<string, unknown>>).map((ln) => {
                  const bva = ln.bom_vs_actual_pct as number | null | undefined;
                  const badge =
                    bva == null
                      ? "text-text-muted"
                      : Math.abs(bva) > 5
                        ? "text-status-danger-foreground font-semibold"
                        : Math.abs(bva) > 2
                          ? "text-status-warning-foreground"
                          : "text-status-success-foreground";
                  return (
                    <tr key={String(ln.bom_line_id)} className="border-t">
                      <td className="px-2 py-2">#{String(ln.bom_line_id)}</td>
                      <td className="px-2 py-2 max-w-[200px] truncate" title={String(ln.description ?? "")}>
                        {String(ln.description ?? ln.item_id ?? "")}
                      </td>
                      <td className="px-2 py-2 text-right">{String(ln.bom_gross_required ?? "—")}</td>
                      <td className="px-2 py-2 text-right">{String(ln.actual_issued_qty ?? "—")}</td>
                      <td className={cn("px-2 py-2 text-right", badge)}>{bva == null ? "—" : `${bva}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedOrderId > 0 && materialVar && materialVar.ok === false ? (
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-text-muted">
          Material variance: {String(materialVar.detail ?? "No active BOM for this order.")}
        </div>
      ) : null}

      {selectedOrderId > 0 && pmiForOrder.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Production material issues (this order)</h2>
          <ul className="space-y-2 text-xs text-text-secondary">
            {pmiForOrder.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-subtle/30 px-3 py-2"
              >
                <span>
                  {p.issue_code} · {p.production_stage} · covered {p.covered_order_qty} · {p.status}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-[11px] font-medium text-brand-primary hover:bg-surface-raised"
                    onClick={() => {
                      void (async () => {
                        try {
                          const d = await api.getProductionMaterialIssuePrintData(p.id);
                          setPmiPrintData(d);
                          setPmiPrintTitle(p.issue_code);
                          setPmiPrintOpen(true);
                        } catch (e) {
                          logApiError("ConsumptionControlPage.pmiPrint", e);
                          setError((e as Error).message);
                        }
                      })();
                    }}
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-raised"
                    onClick={() => {
                      void (async () => {
                        try {
                          const rows = await api.getProductionMaterialIssueGlPostings(p.id);
                          setPmiPostRows(rows);
                          setPmiPostTitle(p.issue_code);
                          setPmiPostOpen(true);
                        } catch (e) {
                          logApiError("ConsumptionControlPage.pmiPostings", e);
                          setError((e as Error).message);
                        }
                      })();
                    }}
                  >
                    GL postings
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedOrderId > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">New production material issue (approved BOM)</h2>
          <p className="mb-3 text-xs text-text-muted">
            Posts stock OUT per BOM line. Over standard beyond tolerance requires manager/admin. Use BOM ID from variance table
            above when available.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              className="rounded border px-3 py-2 text-sm"
              type="number"
              min={1}
              placeholder="BOM ID"
              value={pmiBomId === "" ? "" : String(pmiBomId)}
              onChange={(e) => setPmiBomId(e.target.value ? Number(e.target.value) : "")}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Stage e.g. CUTTING"
              value={pmiStage}
              onChange={(e) => setPmiStage(e.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              type="number"
              min={1}
              placeholder="Covered order qty"
              value={pmiCovered}
              onChange={(e) => setPmiCovered(Number(e.target.value) || 1)}
            />
            <select
              className="rounded border px-3 py-2 text-sm"
              value={String(issueWarehouseId)}
              onChange={(e) => setIssueWarehouseId(Number(e.target.value))}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 space-y-2">
            {pmiLines.map((row, idx) => (
              <div key={idx} className="flex flex-wrap gap-2">
                <input
                  className="rounded border px-3 py-2 text-sm"
                  type="number"
                  placeholder="BOM line ID"
                  value={row.bom_line_id || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPmiLines((prev) => prev.map((r, i) => (i === idx ? { ...r, bom_line_id: v } : r)));
                  }}
                />
                <input
                  className="rounded border px-3 py-2 text-sm"
                  placeholder="Actual issue qty"
                  value={row.actual_issue_qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPmiLines((prev) => prev.map((r, i) => (i === idx ? { ...r, actual_issue_qty: v } : r)));
                  }}
                />
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setPmiLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => setPmiLines((prev) => [...prev, { bom_line_id: 0, actual_issue_qty: "1" }])}
            >
              Add line
            </button>
          </div>
          <button
            type="button"
            className="mt-3 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
            disabled={pmiSaving || pmiBomId === "" || !pmiLines.filter((l) => l.bom_line_id > 0).length}
            onClick={async () => {
              if (pmiBomId === "" || !selectedOrderId) return;
              setPmiSaving(true);
              setError("");
              try {
                await api.createProductionMaterialIssue({
                  order_id: selectedOrderId,
                  bom_id: Number(pmiBomId),
                  production_stage: pmiStage.trim() || "GENERAL",
                  covered_order_qty: pmiCovered,
                  warehouse_id: issueWarehouseId,
                  lines: pmiLines.filter((l) => l.bom_line_id > 0 && l.actual_issue_qty.trim() !== ""),
                });
                await loadSnapshot(selectedOrderId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create production material issue");
              } finally {
                setPmiSaving(false);
              }
            }}
          >
            {pmiSaving ? "Posting…" : "Post production material issue"}
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Issue Reserved Material</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(issueItemId)}
            onChange={(e) => setIssueItemId(Number(e.target.value))}
          >
            {reservations.map((r) => (
              <option key={r.item_id} value={r.item_id}>
                {r.item_name} (Remaining: {r.remaining_qty})
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            value={issueQty}
            onChange={(e) => setIssueQty(e.target.value)}
            placeholder="Issue qty"
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(issueWarehouseId)}
            onChange={(e) => setIssueWarehouseId(Number(e.target.value))}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={issueBomLineId === "" ? "" : String(issueBomLineId)}
            onChange={(e) => setIssueBomLineId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">BOM line (optional — traceability)</option>
            {materialVar?.ok === true && Array.isArray(materialVar.lines)
              ? (materialVar.lines as Array<{ bom_line_id?: number }>).map((ln) => (
                  <option key={ln.bom_line_id} value={ln.bom_line_id}>
                    Line #{ln.bom_line_id}
                  </option>
                ))
              : null}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            value={issueRemarks}
            onChange={(e) => setIssueRemarks(e.target.value)}
            placeholder="Remarks"
          />
          <button
            type="button"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            onClick={() => void issueMaterial()}
          >
            Issue
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Required Qty</th>
              <th className="px-4 py-3">UOM</th>
            </tr>
          </thead>
          <tbody>
            {snapshot?.items?.map((row, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-4 py-3">{String(row.itemName ?? row.item_code ?? "N/A")}</td>
                <td className="px-4 py-3">{String(row.requiredQty ?? row.required_qty ?? "0")}</td>
                <td className="px-4 py-3">{String(row.uom ?? "")}</td>
              </tr>
            ))}
            {!snapshot?.items?.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={3}>
                  No snapshot item rows found for this order.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Reserved</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((row) => (
              <tr key={row.item_id} className="border-t">
                <td className="px-4 py-3">{row.item_name}</td>
                <td className="px-4 py-3">{row.reserved_qty}</td>
                <td className="px-4 py-3">{row.issued_qty}</td>
                <td className="px-4 py-3 font-semibold">{row.remaining_qty}</td>
              </tr>
            ))}
            {!reservations.length ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={4}>
                  No reservation rows available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {layerRecon && layerRecon.items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <h2 className="border-b border-border bg-surface-subtle px-4 py-3 text-sm font-semibold text-text-secondary">
            Quoted vs BOM vs actual (reconciliation)
          </h2>
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Quoted /u</th>
                <th className="px-3 py-2 text-right">BOM net /u</th>
                <th className="px-3 py-2 text-right">Wast %</th>
                <th className="px-3 py-2 text-right">Loss %</th>
                <th className="px-3 py-2 text-right">BOM gross /u</th>
                <th className="px-3 py-2 text-right">Planned qty</th>
                <th className="px-3 py-2 text-right">Actual qty</th>
                <th className="px-3 py-2 text-right">Q↔B %</th>
                <th className="px-3 py-2 text-right">B↔A %</th>
                <th className="px-3 py-2 text-right">Loss Δ</th>
                <th className="px-3 py-2 text-right">Cost impact</th>
              </tr>
            </thead>
            <tbody>
              {layerRecon.items.map((r) => {
                const oq = layerRecon.order.quantity ?? 0;
                const actualPerUnit = oq > 0 ? r.actual_qty / oq : null;
                return (
                  <tr key={r.item_id} className="border-t border-border-subtle">
                    <td className="px-3 py-2">
                      {r.item_code} · {r.item_name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {r.quoted_consumption_per_unit != null ? r.quoted_consumption_per_unit.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {r.bom_net_consumption_per_unit != null ? r.bom_net_consumption_per_unit.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{r.wastage_pct ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-xs">{r.process_loss_pct ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {r.bom_gross_consumption_per_unit != null ? r.bom_gross_consumption_per_unit.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.planned_qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.actual_qty.toFixed(2)}
                      {actualPerUnit != null ? (
                        <span className="block text-[10px] text-text-muted">/u {actualPerUnit.toFixed(4)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.quoted_vs_bom_variance_pct != null ? `${r.quoted_vs_bom_variance_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.bom_vs_actual_variance_pct != null ? `${r.bom_vs_actual_variance_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.planned_loss_vs_actual_loss != null ? r.planned_loss_vs_actual_loss.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.cost_impact_bom_vs_actual != null ? formatMoney(r.cost_impact_bom_vs_actual) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Consumption Change Requests</h2>
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="rounded border px-3 py-2 text-sm" value={crType} onChange={(e) => setCrType(e.target.value)}>
            <option value="QUANTITY_INCREASE">Quantity Increase</option>
            <option value="QUANTITY_DECREASE">Quantity Decrease</option>
            <option value="ITEM_SUBSTITUTION">Item Substitution</option>
            <option value="NEW_ITEM">New Item</option>
          </select>
          <input className="rounded border px-3 py-2 text-sm md:col-span-2" value={crReason} onChange={(e) => setCrReason(e.target.value)} placeholder="Request reason" />
          <button className="rounded border px-4 py-2 text-sm" onClick={addCrItem}>
            Add Item Row
          </button>
          <div />
          <div />
        </div>

        <div className="mb-3 space-y-2">
          {crItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <select
                className="rounded border px-3 py-2 text-sm"
                value={String(item.planItemId)}
                onChange={(e) => updateCrItem(idx, { planItemId: Number(e.target.value) })}
              >
                {snapshot?.items?.map((it, i) => (
                  <option key={i} value={String(it.planItemId ?? 0)}>
                    {String(it.itemName ?? "Item")} (Current: {String(it.requiredQty ?? "0")})
                  </option>
                ))}
              </select>
              <input
                className="rounded border px-3 py-2 text-sm"
                value={item.newQty}
                onChange={(e) => updateCrItem(idx, { newQty: e.target.value })}
                placeholder="New Qty"
              />
              <input
                className="rounded border px-3 py-2 text-sm"
                value={item.reason}
                onChange={(e) => updateCrItem(idx, { reason: e.target.value })}
                placeholder="Item reason"
              />
              <button className="rounded border px-4 py-2 text-sm" onClick={() => removeCrItem(idx)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            onClick={() => void createChangeRequest()}
          >
            Submit CR
          </button>
          <div />
          <div />
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {canReview ? (
            <input className="rounded border px-3 py-2 text-sm" value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="Review reason (for approve/reject)" />
          ) : (
            <div className="rounded border bg-surface-subtle px-3 py-2 text-xs text-text-muted">Review actions are available for manager/admin only.</div>
          )}
          <input className="rounded border px-3 py-2 text-sm" value={crFilter} onChange={(e) => setCrFilter(e.target.value)} placeholder="Filter status (PENDING/APPROVED/REJECTED)" />
          <button className="rounded border px-4 py-2 text-sm" onClick={() => void loadSnapshot(selectedOrderId)}>
            Reload CR List
          </button>
        </div>

        <div className="overflow-x-auto rounded border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Timeline</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {changeRequests.map((cr) => (
                <Fragment key={cr.id}>
                  <tr className="border-t">
                    <td className="px-4 py-3">{cr.id}</td>
                    <td className="px-4 py-3">{cr.change_type}</td>
                    <td className="px-4 py-3">{cr.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${crStatusBadgeClass(cr.status)}`}>{cr.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      <div>Requested: {new Date(cr.created_at).toLocaleString()}</div>
                      {cr.reviewed_at ? <div>Reviewed: {new Date(cr.reviewed_at).toLocaleString()}</div> : null}
                      {cr.review_note ? <div>Note: {cr.review_note}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => setExpandedCrId((prev) => (prev === cr.id ? null : cr.id))}
                        >
                          {expandedCrId === cr.id ? "Hide Details" : "View Details"}
                        </button>
                        {canReview && cr.status === "PENDING" ? (
                          <>
                            <button className="rounded border px-2 py-1 text-xs" onClick={() => void approveCR(cr.id)}>
                              Approve
                            </button>
                            <button className="rounded border px-2 py-1 text-xs" onClick={() => void rejectCR(cr.id)}>
                              Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedCrId === cr.id ? (
                    <tr className="border-t bg-surface-subtle">
                      <td className="px-4 py-3 text-xs text-text-secondary" colSpan={6}>
                        <div className="mb-2 font-semibold text-text-secondary">Requested Item Changes</div>
                        <div className="space-y-2">
                          {(cr.items || []).map((row, idx) => {
                            const planItemId = Number(row.plan_item_id ?? 0);
                            const current = snapshot?.items?.find((it) => Number(it.planItemId ?? 0) === planItemId);
                            return (
                              <div key={idx} className="rounded border bg-surface-raised p-2">
                                <div>
                                  Item: {String(current?.itemName ?? `PlanItem#${planItemId}`)} | Current Qty: {String(current?.requiredQty ?? "-")}
                                </div>
                                <div>Requested Qty: {String(row.new_qty ?? "-")}</div>
                                {row.reason ? <div>Reason: {String(row.reason)}</div> : null}
                              </div>
                            );
                          })}
                          {!cr.items?.length ? <div>No item-level changes stored.</div> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!changeRequests.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                    No change requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {pmiPrintOpen && pmiPrintData ? (
        <PrintPreviewModal
          open={pmiPrintOpen}
          title={`Print — ${pmiPrintTitle}`}
          onClose={() => {
            setPmiPrintOpen(false);
            setPmiPrintData(null);
          }}
          copyCount={pmiPrintCopy}
          onCopyCountChange={setPmiPrintCopy}
          template={pmiPrintTpl}
          onTemplateChange={setPmiPrintTpl}
        >
          <InventoryDocumentPrintSheets data={pmiPrintData} copyCount={pmiPrintCopy} template={pmiPrintTpl} />
        </PrintPreviewModal>
      ) : null}

      {pmiPostOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text-primary">GL postings — {pmiPostTitle}</h3>
              <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => setPmiPostOpen(false)}>
                Close
              </button>
            </div>
            <GlPostingsPanel postings={pmiPostRows} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

