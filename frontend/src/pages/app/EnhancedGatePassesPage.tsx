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
        <h1 className="text-2xl font-bold text-brand-primary">Enhanced Gate Passes</h1>
        <p className="text-sm text-text-muted">Release control with approval and guard acknowledgement.</p>
      </div>
      {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
      <div className="rounded-xl border border-border bg-surface-raised p-3">
        <label className="mr-2 text-xs font-semibold text-text-secondary">Status Filter</label>
        <input className="rounded border px-2 py-1 text-xs" value={statusFilter} placeholder="e.g. RELEASED" onChange={(e) => setStatusFilter(e.target.value.toUpperCase())} />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createEnhancedGatePass(form);
          setForm({ challan_id: null, purpose: "", status: "DRAFT" });
          await load();
        }}
        className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 md:grid-cols-5 gap-2"
      >
        <select className="rounded border px-3 py-2 text-sm" value={form.challan_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, challan_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">No challan linked</option>
          {challans.map((dc) => <option key={dc.id} value={dc.id}>{dc.challan_code}</option>)}
        </select>
        <input className="rounded border px-3 py-2 text-sm" placeholder="Purpose" value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Destination" value={form.destination ?? ""} onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Vehicle no" value={form.vehicle_no ?? ""} onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))} />
        <button className="rounded bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground">Create Gate Pass</button>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Purpose</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Challan</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Guard Ack</th>
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
                    className={`rounded px-2 py-1 text-xs ${row.guard_acknowledged ? "bg-status-success-subtle text-status-success-foreground" : "border border-border-strong text-text-secondary"}`}
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
