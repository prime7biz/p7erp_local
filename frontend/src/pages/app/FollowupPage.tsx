import { useEffect, useState } from "react";
import { api, type FollowupResponse, type OrderResponse } from "@/api/client";

export function FollowupPage() {
  const [rows, setRows] = useState<FollowupResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [orderId, setOrderId] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [f, o] = await Promise.all([
        api.listFollowups(),
        api.listOrders({ limit: 200, offset: 0 }),
      ]);
      setRows(f);
      setOrders(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load follow-ups");
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Order Follow-up</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track pending merchandising actions per order.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-2">
        <select value={orderId || ""} onChange={(e) => setOrderId(Number(e.target.value) || 0)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">Select order…</option>
          {orders.map((o) => <option key={o.id} value={o.id}>{o.order_code}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow-up title" className="min-w-72 rounded border border-gray-300 px-3 py-2 text-sm" />
        <button
          onClick={async () => {
            if (!orderId || !title.trim()) return;
            await api.createFollowup({ order_id: orderId, title: title.trim(), status: "OPEN" });
            setTitle("");
            await load();
          }}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add
        </button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Due</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 text-gray-700">#{r.order_id}</td>
                <td className="px-4 py-2 text-gray-900">{r.title}</td>
                <td className="px-4 py-2 text-gray-700">{r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.status}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button
                    onClick={async () => { await api.updateFollowup(r.id, { status: r.status === "DONE" ? "OPEN" : "DONE" }); await load(); }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                  >
                    {r.status === "DONE" ? "Reopen" : "Done"}
                  </button>
                  <button onClick={async () => { await api.deleteFollowup(r.id); await load(); }} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No follow-ups yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
