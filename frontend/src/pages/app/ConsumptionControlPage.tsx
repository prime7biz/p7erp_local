import { Fragment, useEffect, useState } from "react";
import { api, type OrderResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export function ConsumptionControlPage() {
  const { me } = useAuth();
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof api.getConsumptionSnapshot>> | null>(null);
  const [reservations, setReservations] = useState<Awaited<ReturnType<typeof api.getConsumptionReservations>>>([]);
  const [issueItemId, setIssueItemId] = useState<number>(0);
  const [issueQty, setIssueQty] = useState<string>("0");
  const [issueWarehouseId, setIssueWarehouseId] = useState<number>(0);
  const [issueRemarks, setIssueRemarks] = useState<string>("");
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

  const crStatusBadgeClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === "PENDING") return "bg-amber-100 text-amber-700";
    if (s === "APPROVED") return "bg-green-100 text-green-700";
    if (s === "REJECTED") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-700";
  };
  const trend = (key: keyof typeof kpi) => {
    if (!prevKpi) return "";
    if (kpi[key] > prevKpi[key]) return "↑";
    if (kpi[key] < prevKpi[key]) return "↓";
    return "→";
  };

  const loadOrders = async () => {
    try {
      const rows = await api.listOrders({ limit: 100 });
      setOrders(rows);
      if (!selectedOrderId && rows[0]) setSelectedOrderId(rows[0].id);
      const whRows = await api.listWarehouses();
      setWarehouses(whRows);
      if (!issueWarehouseId && whRows[0]) setIssueWarehouseId(whRows[0].id);
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
  };

  const loadSnapshot = async (orderId: number) => {
    if (!orderId) return;
    try {
      const [snap, resv] = await Promise.all([api.getConsumptionSnapshot(orderId), api.getConsumptionReservations(orderId)]);
      setSnapshot(snap);
      setReservations(resv);
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
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

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
  }, [selectedOrderId]);

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
        <h1 className="text-2xl font-semibold text-slate-900">Consumption Control</h1>
        <p className="text-sm text-slate-500">Finalize order BOM snapshots and keep material usage controlled.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open PO</div><div className="text-xl font-semibold">{kpi.openPo} <span className="text-xs text-slate-400">{trend("openPo")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open GRN</div><div className="text-xl font-semibold">{kpi.openGrn} <span className="text-xs text-slate-400">{trend("openGrn")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Pending CR</div><div className="text-xl font-semibold">{kpi.pendingCr} <span className="text-xs text-slate-400">{trend("pendingCr")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Low Stock Items</div><div className="text-xl font-semibold">{kpi.lowStock} <span className="text-xs text-slate-400">{trend("lowStock")}</span></div></div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
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
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void finalize()}>
            Finalize Order Snapshot
          </button>
        </div>
        <div className="rounded border border-slate-200 p-3 text-sm">
          <div className="mb-2 font-medium">Snapshot Status</div>
          <div className="text-slate-600">{snapshot?.snapshot_locked ? "Locked" : "Open"}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Issue Reserved Material</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
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
          <input
            className="rounded border px-3 py-2 text-sm"
            value={issueRemarks}
            onChange={(e) => setIssueRemarks(e.target.value)}
            placeholder="Remarks"
          />
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void issueMaterial()}>
            Issue
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
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
                <td className="px-4 py-8 text-center text-slate-500" colSpan={3}>
                  No snapshot item rows found for this order.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
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
                <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                  No reservation rows available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Consumption Change Requests</h2>
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
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => void createChangeRequest()}>
            Submit CR
          </button>
          <div />
          <div />
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {canReview ? (
            <input className="rounded border px-3 py-2 text-sm" value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="Review reason (for approve/reject)" />
          ) : (
            <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-500">Review actions are available for manager/admin only.</div>
          )}
          <input className="rounded border px-3 py-2 text-sm" value={crFilter} onChange={(e) => setCrFilter(e.target.value)} placeholder="Filter status (PENDING/APPROVED/REJECTED)" />
          <button className="rounded border px-4 py-2 text-sm" onClick={() => void loadSnapshot(selectedOrderId)}>
            Reload CR List
          </button>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
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
                    <td className="px-4 py-3 text-xs text-slate-600">
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
                    <tr className="border-t bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-600" colSpan={6}>
                        <div className="mb-2 font-semibold text-slate-700">Requested Item Changes</div>
                        <div className="space-y-2">
                          {(cr.items || []).map((row, idx) => {
                            const planItemId = Number(row.plan_item_id ?? 0);
                            const current = snapshot?.items?.find((it) => Number(it.planItemId ?? 0) === planItemId);
                            return (
                              <div key={idx} className="rounded border bg-white p-2">
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
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    No change requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

