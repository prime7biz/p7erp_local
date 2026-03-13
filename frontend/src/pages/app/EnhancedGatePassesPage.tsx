import { useEffect, useState } from "react";
import {
  api,
  type DeliveryChallanResponse,
  type EnhancedGatePassCreate,
  type EnhancedGatePassResponse,
} from "@/api/client";

export function EnhancedGatePassesPage() {
  const [rows, setRows] = useState<EnhancedGatePassResponse[]>([]);
  const [challans, setChallans] = useState<DeliveryChallanResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<EnhancedGatePassCreate>({
    challan_id: null,
    purpose: "",
    status: "DRAFT",
  });

  const statuses = ["DRAFT", "SUBMITTED", "APPROVED", "RELEASED", "REJECTED"];

  const load = async () => {
    try {
      const [gps, dcs] = await Promise.all([api.listEnhancedGatePasses(), api.listDeliveryChallans()]);
      setRows(gps);
      setChallans(dcs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gate passes");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    load();
  }, []);

  const filteredRows = statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter) : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enhanced Gate Passes</h1>
        <p className="text-sm text-gray-500">Release control with approval and guard acknowledgement.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <label className="mr-2 text-xs font-semibold text-gray-600">Status Filter</label>
        <input className="rounded border px-2 py-1 text-xs" value={statusFilter} placeholder="e.g. RELEASED" onChange={(e) => setStatusFilter(e.target.value.toUpperCase())} />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createEnhancedGatePass(form);
          setForm({ challan_id: null, purpose: "", status: "DRAFT" });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-2"
      >
        <select className="rounded border px-3 py-2 text-sm" value={form.challan_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, challan_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">No challan linked</option>
          {challans.map((dc) => <option key={dc.id} value={dc.id}>{dc.challan_code}</option>)}
        </select>
        <input className="rounded border px-3 py-2 text-sm" placeholder="Purpose" value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Destination" value={form.destination ?? ""} onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Vehicle no" value={form.vehicle_no ?? ""} onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))} />
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Gate Pass</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Purpose</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Challan</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Guard Ack</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm font-medium">{row.gate_pass_code}</td>
                <td className="px-3 py-2 text-sm">{row.purpose}</td>
                <td className="px-3 py-2 text-sm">{row.challan_id ? `#${row.challan_id}` : "—"}</td>
                <td className="px-3 py-2 text-sm">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={row.status}
                    onChange={async (e) => {
                      await api.updateEnhancedGatePassStatus(row.id, { status: e.target.value });
                      await load();
                    }}
                  >
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${row.guard_acknowledged ? "bg-emerald-100 text-emerald-700" : "border border-gray-300 text-gray-700"}`}
                    onClick={async () => {
                      await api.updateEnhancedGatePassStatus(row.id, { guard_acknowledged: !row.guard_acknowledged });
                      await load();
                    }}
                  >
                    {row.guard_acknowledged ? "Acknowledged" : "Mark Ack"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
