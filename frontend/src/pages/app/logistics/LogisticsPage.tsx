import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type ShipmentCreate, type ShipmentRow, type TradeCaseRow } from "@/api/client";

const EMPTY_FORM: ShipmentCreate = {
  trade_case_id: 0,
  reference: "",
  status: "PLANNED",
  carrier: "",
  booking_ref: "",
  bl_awb: "",
  etd: "",
  eta: "",
  origin_port: "",
  dest_port: "",
  notes: "",
};

export function LogisticsPage() {
  const [params] = useSearchParams();
  const preselectedTradeCaseId = Number(params.get("trade_case_id") || 0);

  const [items, setItems] = useState<ShipmentRow[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [form, setForm] = useState<ShipmentCreate>({
    ...EMPTY_FORM,
    trade_case_id: preselectedTradeCaseId || 0,
  });
  const [filterTradeCaseId, setFilterTradeCaseId] = useState<number | undefined>(
    preselectedTradeCaseId || undefined
  );
  const [filterStatus, setFilterStatus] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [shipments, cases] = await Promise.all([
        api.listShipments({
          trade_case_id: filterTradeCaseId,
          status: filterStatus || undefined,
        }),
        api.listTradeCases({ limit: 500 }),
      ]);
      setItems(shipments);
      setTradeCases(cases);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load logistics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filterTradeCaseId, filterStatus]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.trade_case_id || !form.reference.trim()) {
      setError("Trade case and shipment reference are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.updateShipment(editingId, {
          reference: form.reference.trim(),
          status: form.status,
          carrier: form.carrier,
          booking_ref: form.booking_ref,
          bl_awb: form.bl_awb,
          etd: form.etd,
          eta: form.eta,
          origin_port: form.origin_port,
          dest_port: form.dest_port,
          notes: form.notes,
        });
      } else {
        await api.createShipment({
          ...form,
          reference: form.reference.trim(),
        });
      }
      setForm({
        ...EMPTY_FORM,
        trade_case_id: preselectedTradeCaseId || 0,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Logistics</h1>
        <p className="text-sm text-text-muted">
          Shipment booking, BL/AWB tracking, and ETA monitoring linked with trade cases.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
      )}

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">{editingId ? "Update Shipment" : "Create Shipment"}</h2>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Trade Case *</label>
            <select
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.trade_case_id || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, trade_case_id: Number(e.target.value || 0) }))}
              required
            >
              <option value="">Select trade case</option>
              {tradeCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.reference} ({tc.direction})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Reference *</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.reference}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="SHIP-2026-001"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Status</label>
            <select
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.status || "PLANNED"}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="PLANNED">PLANNED</option>
              <option value="BOOKED">BOOKED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="ARRIVED">ARRIVED</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Carrier</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.carrier || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Booking Ref</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.booking_ref || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, booking_ref: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">BL/AWB</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.bl_awb || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, bl_awb: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">ETD</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.etd || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, etd: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">ETA</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.eta || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, eta: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Origin Port</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.origin_port || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, origin_port: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Destination Port</label>
            <input
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.dest_port || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, dest_port: e.target.value }))}
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Notes</label>
            <textarea
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
              value={form.notes || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="md:col-span-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Shipment" : "Create Shipment"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({
                    ...EMPTY_FORM,
                    trade_case_id: preselectedTradeCaseId || 0,
                  });
                }}
                className="rounded-xl border border-border-strong bg-surface-raised px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2">
          <select
            value={filterTradeCaseId ?? ""}
            onChange={(e) => setFilterTradeCaseId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
          >
            <option value="">All trade cases</option>
            {tradeCases.map((tc) => (
              <option key={tc.id} value={tc.id}>
                {tc.reference}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PLANNED">PLANNED</option>
            <option value="BOOKED">BOOKED</option>
            <option value="IN_TRANSIT">IN_TRANSIT</option>
            <option value="ARRIVED">ARRIVED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading shipments...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-text-muted">No shipments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Trade Case</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Booking Ref</th>
                  <th className="px-4 py-3">BL/AWB</th>
                  <th className="px-4 py-3">ETD</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{row.reference}</td>
                    <td className="px-4 py-2.5">#{row.trade_case_id}</td>
                    <td className="px-4 py-2.5">{row.status}</td>
                    <td className="px-4 py-2.5">{row.carrier || "—"}</td>
                    <td className="px-4 py-2.5">{row.booking_ref || "—"}</td>
                    <td className="px-4 py-2.5">{row.bl_awb || "—"}</td>
                    <td className="px-4 py-2.5">{row.etd ? new Date(row.etd).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5">{row.eta ? new Date(row.eta).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            trade_case_id: row.trade_case_id,
                            reference: row.reference,
                            status: row.status,
                            carrier: row.carrier || "",
                            booking_ref: row.booking_ref || "",
                            bl_awb: row.bl_awb || "",
                            etd: row.etd || "",
                            eta: row.eta || "",
                            origin_port: row.origin_port || "",
                            dest_port: row.dest_port || "",
                            notes: row.notes || "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
