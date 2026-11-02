import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type PackingListRow } from "@/api/client";
import { PackingCartonsEditor } from "@/components/logistics/PackingCartonsEditor";
import { logApiError } from "@/utils/logApiError";

const CONTAINER_TYPES = ["20GP", "40GP", "40HQ", "LCL"];
const LOADING_STATUSES = ["EMPTY", "LOADING", "LOADED", "CLOSED"];

export function PackingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const packingListId = Number(id);
  const [item, setItem] = useState<PackingListRow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [containerNumber, setContainerNumber] = useState("");
  const [containerType, setContainerType] = useState("40GP");
  const [sealNumber, setSealNumber] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(packingListId) || packingListId <= 0) return;
    setError("");
    try {
      setItem(await api.getPackingList(packingListId));
    } catch (err) {
      logApiError("PackingListDetailPage.load", err);
      setError(err instanceof Error ? err.message : "Failed to load packing list");
    }
  }, [packingListId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!item && !error) {
    return <div className="p-4 text-sm text-text-muted">Loading packing list…</div>;
  }
  if (!item) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-status-danger-foreground">{error}</p>
        <Link to="/app/logistics?tab=packing" className="text-sm text-accent-secondary hover:underline">
          Back to logistics
        </Link>
      </div>
    );
  }

  const isDraft = (item.status || "").toUpperCase() === "DRAFT";
  const containers = item.containers || [];
  const canFinalize = isDraft && containers.length > 0 && Number(item.total_cartons || 0) > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-text-muted">
            <Link to="/app/logistics?tab=packing" className="hover:underline">
              Packing lists
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{item.packing_list_number}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Status{" "}
            <span className="font-medium text-text-secondary">{item.status}</span>
            {item.shipment_reference ? ` · Shipment ${item.shipment_reference}` : null}
            {item.order_code ? ` · Order ${item.order_code}` : null}
            {item.challan_code ? ` · Challan ${item.challan_code}` : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.shipment_id ? (
            <Link
              to={`/app/logistics?tab=shipments`}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              View shipments
            </Link>
          ) : null}
          {item.order_id ? (
            <Link
              to={`/app/orders/${item.order_id}`}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Order
            </Link>
          ) : null}
          {item.delivery_challan_id ? (
            <Link
              to={`/app/inventory/delivery-challans/${item.delivery_challan_id}`}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Challan
            </Link>
          ) : null}
          {canFinalize ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setItem(await api.finalizePackingList(item.id));
                } catch (err) {
                  logApiError("PackingListDetailPage.finalize", err);
                  setError(err instanceof Error ? err.message : "Finalize failed");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Finalizing…" : "Finalize"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Total cartons</p>
          <p className="text-sm font-semibold">{item.total_cartons}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Gross weight (kg)</p>
          <p className="text-sm font-semibold">{item.gross_weight_kg ?? item.gross_weight ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Net weight (kg)</p>
          <p className="text-sm font-semibold">{item.net_weight_kg ?? item.net_weight ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Packing date</p>
          <p className="text-sm font-semibold">{item.packing_date ?? "—"}</p>
        </div>
      </div>

      <PackingCartonsEditor packingListId={item.id} onSaved={() => void load()} />

      <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Containers</h2>
        {isDraft && item.shipment_id ? (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api.addPackingListContainer(item.id, {
                  container_number: containerNumber.trim(),
                  container_type: containerType,
                  seal_number: sealNumber || null,
                  tare_weight_kg: tareWeight ? Number(tareWeight) : null,
                  max_weight_kg: maxWeight ? Number(maxWeight) : null,
                });
                setContainerNumber("");
                setSealNumber("");
                setTareWeight("");
                setMaxWeight("");
                await load();
              } catch (err) {
                logApiError("PackingListDetailPage.addContainer", err);
                setError(err instanceof Error ? err.message : "Add container failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="space-y-1 text-xs">
              <span>Container #</span>
              <input
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="space-y-1 text-xs">
              <span>Type</span>
              <select
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span>Seal #</span>
              <input
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span>Tare weight (kg)</span>
              <input
                type="number"
                step="0.01"
                value={tareWeight}
                onChange={(e) => setTareWeight(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span>Max weight (kg)</span>
              <input
                type="number"
                step="0.01"
                value={maxWeight}
                onChange={(e) => setMaxWeight(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-brand-primary/40 bg-brand-subtle px-3 py-2 text-sm font-semibold text-brand-primary disabled:opacity-50"
              >
                Add container
              </button>
            </div>
          </form>
        ) : null}
        {!item.shipment_id && isDraft ? (
          <p className="text-xs text-status-warning-foreground">
            Link a shipment on this packing list before adding containers.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="py-1.5 pr-3">Number</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3">Seal</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Max kg</th>
                <th className="py-1.5">Remaining kg</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b border-border-subtle/60">
                  <td className="py-1.5 pr-3 font-medium">{c.container_number}</td>
                  <td className="py-1.5 pr-3">{c.container_type ?? "—"}</td>
                  <td className="py-1.5 pr-3">{c.seal_number ?? "—"}</td>
                  <td className="py-1.5 pr-3">{c.loading_status}</td>
                  <td className="py-1.5 pr-3">{c.max_weight_kg ?? "—"}</td>
                  <td className="py-1.5">{c.remaining_capacity_kg ?? "—"}</td>
                </tr>
              ))}
              {!containers.length ? (
                <tr>
                  <td colSpan={6} className="py-3 text-text-muted">
                    No containers yet. {LOADING_STATUSES[0] ? "Add one above." : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
