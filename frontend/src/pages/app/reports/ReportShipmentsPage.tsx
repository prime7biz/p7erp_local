import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ShipmentRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportShipmentsPage() {
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listShipments({ status: statusFilter || undefined, limit: 500 })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportShipmentsPage.listShipments", e);
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Shipment Tracking</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Logistics shipments linked to trade cases.{" "}
          <Link to="/app/logistics" className="text-brand-primary hover:underline">
            Logistics hub
          </Link>
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-muted">Status</label>
        <input
          className="rounded border border-border-strong px-2 py-1 text-sm"
          placeholder="Filter (optional)"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No shipments</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Reference</th>
                <th className="py-2 px-4">Trade case</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Carrier</th>
                <th className="py-2 px-4">Booking</th>
                <th className="py-2 px-4">BL/AWB</th>
                <th className="py-2 px-4">ETD</th>
                <th className="py-2 px-4">ETA</th>
                <th className="py-2 px-4">Origin → Dest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 px-4 font-medium text-text-primary">{r.reference}</td>
                  <td className="py-2 px-4">
                    <Link
                      to={`/app/trade/cases/${r.trade_case_id}`}
                      className="text-brand-primary hover:underline"
                    >
                      #{r.trade_case_id}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-text-secondary">{r.status}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.carrier ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.booking_ref ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.bl_awb ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.etd ? new Date(r.etd).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.eta ? new Date(r.eta).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">
                    {(r.origin_port ?? "—") + " → " + (r.dest_port ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
