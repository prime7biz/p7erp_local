import { useEffect, useMemo, useState } from "react";

import { api, type MfgSampleRequestCreate } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function SamplesRequestsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listMfgSampleRequests>>>([]);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof api.listOrders>>>([]);
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.listInventoryItems>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.listUsers>>>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [editById, setEditById] = useState<Record<number, { priority: string; target_date: string; notes: string }>>({});
  const [form, setForm] = useState<MfgSampleRequestCreate>({
    sample_type: "fit",
    priority: "medium",
    requested_date: todayIso(),
    target_date: todayIso(),
    order_id: null,
    item_id: null,
  });

  const load = async () => {
    setError("");
    try {
      const [sampleRows, orderRows, itemRows, userRows] = await Promise.all([
        api.listMfgSampleRequests({ status_filter: statusFilter || undefined }),
        api.listOrders(),
        api.listInventoryItems(),
        api.listUsers(),
      ]);
      setRows(sampleRows);
      setOrders(orderRows);
      setItems(itemRows);
      setUsers(userRows.filter((row) => row.is_active));
      setEditById(
        Object.fromEntries(
          sampleRows.map((row) => [
            row.id,
            { priority: row.priority, target_date: row.target_date ?? "", notes: row.notes ?? "" },
          ]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load samples");
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const orderMap = useMemo(() => new Map(orders.map((row) => [row.id, row.order_code])), [orders]);
  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row.name])), [items]);
  const myRole = useMemo(() => {
    const mine = users.find((row) => row.id === me?.user_id);
    return (mine?.role_name ?? "").trim().toLowerCase();
  }, [users, me?.user_id]);
  const canManage = myRole === "admin" || myRole === "manager" || myRole === "supervisor";

  const createSample = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createMfgSampleRequest(form);
      setForm({
        sample_type: "fit",
        priority: "medium",
        requested_date: todayIso(),
        target_date: todayIso(),
        order_id: null,
        item_id: null,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create sample request");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (sampleId: number, nextStatus: string) => {
    if (!canManage) return;
    setError("");
    try {
      await api.updateMfgSampleRequestStatus(sampleId, nextStatus);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update sample status");
    }
  };

  const saveEdit = async (sampleId: number) => {
    if (!canManage) return;
    const edit = editById[sampleId];
    if (!edit) return;
    setSavingEditId(sampleId);
    setError("");
    try {
      await api.updateMfgSampleRequest(sampleId, {
        priority: edit.priority,
        target_date: edit.target_date || null,
        notes: edit.notes,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update sample");
    } finally {
      setSavingEditId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Sample Requests</h1>
        <p className="text-sm text-slate-500">Create and track sample requests from draft to buyer approval.</p>
      </div>
      {!canManage ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You have view-only access. Supervisor/Manager/Admin role is required for sample updates.
        </div>
      ) : null}

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Sample Request</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={createSample}>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Optional sample no"
            value={form.sample_no ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, sample_no: e.target.value }))}
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.order_id ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, order_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Select order (optional)</option>
            {orders.map((row) => (
              <option key={row.id} value={row.id}>
                {row.order_code}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.item_id ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, item_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Select item (optional)</option>
            {items.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.sample_type ?? "fit"}
            onChange={(e) => setForm((prev) => ({ ...prev, sample_type: e.target.value }))}
          >
            <option value="fit">Fit</option>
            <option value="pp">PP</option>
            <option value="size_set">Size Set</option>
            <option value="shipment">Shipment</option>
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.priority ?? "medium"}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            type="date"
            value={form.requested_date ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, requested_date: e.target.value || null }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            type="date"
            value={form.target_date ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, target_date: e.target.value || null }))}
          />
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60" disabled={saving || !canManage} type="submit">
            {saving ? "Saving..." : "Create"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="in_progress">In Progress</option>
            <option value="sent_to_buyer">Sent To Buyer</option>
            <option value="revision_required">Revision Required</option>
            <option value="approved_by_buyer">Approved By Buyer</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Sample No</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Target Date</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 font-medium">{row.sample_no}</td>
                <td className="px-3 py-2">{row.sample_type}</td>
                <td className="px-3 py-2">{row.order_id ? orderMap.get(row.order_id) ?? `Order #${row.order_id}` : "-"}</td>
                <td className="px-3 py-2">{row.item_id ? itemMap.get(row.item_id) ?? `Item #${row.item_id}` : "-"}</td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={editById[row.id]?.priority ?? row.priority}
                    onChange={(e) =>
                      setEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { priority: row.priority, target_date: row.target_date ?? "", notes: row.notes ?? "" }), priority: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    className="rounded border px-2 py-1 text-xs"
                    type="date"
                    value={editById[row.id]?.target_date ?? row.target_date ?? ""}
                    onChange={(e) =>
                      setEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { priority: row.priority, target_date: row.target_date ?? "", notes: row.notes ?? "" }), target_date: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-44 rounded border px-2 py-1 text-xs"
                    value={editById[row.id]?.notes ?? row.notes ?? ""}
                    onChange={(e) =>
                      setEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { priority: row.priority, target_date: row.target_date ?? "", notes: row.notes ?? "" }), notes: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  />
                </td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveEdit(row.id)} disabled={!canManage || savingEditId === row.id}>
                      {savingEditId === row.id ? "Saving..." : "Save"}
                    </button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void setStatus(row.id, "submitted")} disabled={!canManage}>Submit</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void setStatus(row.id, "in_progress")} disabled={!canManage}>Start</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void setStatus(row.id, "sent_to_buyer")} disabled={!canManage}>Send</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void setStatus(row.id, "approved_by_buyer")} disabled={!canManage}>Approve</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void setStatus(row.id, "closed")} disabled={!canManage}>Close</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>No sample requests found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
