import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type StockItemDetailResponse, type StockItemPriceUpsert } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";

type Tab = "overview" | "planning" | "batches" | "godown" | "ledger" | "pricing";

export function StockItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const [data, setData] = useState<StockItemDetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [priceForm, setPriceForm] = useState<StockItemPriceUpsert>({
    price_list_name: "Wholesale",
    price: "0",
    currency: "BDT",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const latest = useLatestRequest();

  const load = useCallback(async () => {
    if (!itemId) return;
    const token = latest.begin();
    try {
      setError("");
      const detail = await api.getStockItemDetail(itemId);
      if (!latest.isCurrent(token)) return;
      setData(detail);
    } catch (e) {
      logApiError("StockItemDetailPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePrice(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    try {
      setSaving(true);
      setError("");
      await api.putStockItemPrices(data.id, [priceForm]);
      await load();
    } catch (err) {
      logApiError("StockItemDetailPage.savePrice", err);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "planning", label: "Planning" },
    { id: "batches", label: "Batches" },
    { id: "godown", label: "Godown-wise" },
    { id: "ledger", label: "Ledger" },
    { id: "pricing", label: "Pricing" },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title={data ? `${data.item_code} — ${data.name}` : "Stock Item"}
        description="Valuation, batches, godown stock, movements, and price lists"
        actions={
          <Link
            to="/app/inventory/stock-items"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Back to list
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {!data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-gray-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm ${
                  tab === t.id
                    ? "border-b-2 border-blue-600 font-medium text-blue-700"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Current stock" value={data.current_stock} />
              <Metric label="Current value" value={data.current_value} />
              <Metric label="Avg cost" value={data.avg_cost} />
              <Metric label="Standard price" value={data.standard_price ?? "—"} />
              <Metric label="Valuation method" value={String(data.valuation?.method ?? data.default_valuation_method ?? "—")} />
              <Metric label="Valuation qty" value={String(data.valuation?.qty ?? "—")} />
              <Metric label="Valuation total" value={String(data.valuation?.total_value ?? "—")} />
              <Metric label="Batch tracking" value={data.batch_tracking ? "Yes" : "No"} />
            </div>
          ) : null}

          {tab === "planning" ? (
            <PlanningTab itemId={data.id} onSaved={() => void load()} />
          ) : null}

          {tab === "batches" ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2">Godown</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map((b) => (
                    <tr key={b.id ?? b.batch_id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{b.batch_number}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.current_qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.cost_per_unit ?? "—"}</td>
                      <td className="px-3 py-2">{b.expiry_date ?? "—"}</td>
                      <td className="px-3 py-2">{b.godown_name ?? (b.godown_id != null ? `#${b.godown_id}` : "—")}</td>
                      <td className="px-3 py-2">{b.status ?? "—"}</td>
                    </tr>
                  ))}
                  {!data.batches.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No batches (enable batch tracking and receive GRN).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "godown" ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Godown</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.godown_stock.map((g, i) => (
                    <tr key={`${g.godown_id}-${i}`} className="border-t border-gray-100">
                      <td className="px-3 py-2">{g.godown_name ?? (g.godown_id != null ? `#${g.godown_id}` : "Unassigned")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{g.qty}</td>
                    </tr>
                  ))}
                  {!data.godown_stock.length ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-gray-500">
                        No godown stock recorded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "ledger" ? (
            <div className="space-y-3">
              <Link
                to="/app/finance/stock-transfer-vouchers/new"
                className="inline-block rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                New stock transfer voucher
              </Link>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Warehouse</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap">{m.date ?? "—"}</td>
                      <td className="px-3 py-2">{m.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.qty}</td>
                      <td className="px-3 py-2">{m.warehouse_id ?? "—"}</td>
                      <td className="px-3 py-2">{m.batch_id ?? m.lot_number ?? "—"}</td>
                      <td className="px-3 py-2">
                        {m.reference_type ?? "—"}
                        {m.reference_id != null ? ` #${m.reference_id}` : ""}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{m.notes ?? ""}</td>
                    </tr>
                  ))}
                  {!data.ledger.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        No stock movements yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>
          ) : null}

          {tab === "pricing" ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Price list</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2">Currency</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">To</th>
                      <th className="px-3 py-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.prices.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{p.price_list_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.price}</td>
                        <td className="px-3 py-2">{p.currency}</td>
                        <td className="px-3 py-2">{p.effective_from ?? "—"}</td>
                        <td className="px-3 py-2">{p.effective_to ?? "—"}</td>
                        <td className="px-3 py-2">{p.is_active ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                    {!data.prices.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                          No price lists yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <form
                onSubmit={savePrice}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <label className="text-xs text-gray-600">
                  List name
                  <select
                    className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={priceForm.price_list_name}
                    onChange={(e) => setPriceForm((p) => ({ ...p, price_list_name: e.target.value }))}
                  >
                    <option>Wholesale</option>
                    <option>Retail</option>
                    <option>Distributor</option>
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  Price
                  <input
                    className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={String(priceForm.price)}
                    onChange={(e) => setPriceForm((p) => ({ ...p, price: e.target.value }))}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Effective from
                  <input
                    type="date"
                    className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={priceForm.effective_from ?? ""}
                    onChange={(e) =>
                      setPriceForm((p) => ({ ...p, effective_from: e.target.value || null }))
                    }
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save price"}
                </button>
              </form>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function PlanningTab({ itemId, onSaved }: { itemId: number; onSaved: () => void }) {
  const [autoReorder, setAutoReorder] = useState(false);
  const [reorderLevel, setReorderLevel] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [safetyStock, setSafetyStock] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [lotMethod, setLotMethod] = useState("L4L");
  const [fixedLot, setFixedLot] = useState("");
  const [preferredVendor, setPreferredVendor] = useState("");
  const [fence, setFence] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const it = await api.getInventoryItem(itemId);
        setAutoReorder(!!it.auto_reorder_enabled);
        setReorderLevel(it.reorder_level ?? "");
        setReorderQty(it.reorder_qty ?? "");
        setSafetyStock(it.safety_stock ?? "");
        setLeadTime(it.lead_time_days != null ? String(it.lead_time_days) : "");
        setLotMethod(it.lot_size_method ?? "L4L");
        setFixedLot(it.fixed_lot_size ?? "");
        setPreferredVendor(it.preferred_vendor_id != null ? String(it.preferred_vendor_id) : "");
        setFence(it.planning_time_fence_days != null ? String(it.planning_time_fence_days) : "");
      } catch (e) {
        logApiError("PlanningTab.load", e);
        setErr((e as Error).message);
      }
    })();
  }, [itemId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (autoReorder && !reorderLevel) {
      setErr("Reorder level is required when Auto Reorder is enabled");
      return;
    }
    try {
      setSaving(true);
      setErr("");
      await api.updateInventoryItem(itemId, {
        auto_reorder_enabled: autoReorder,
        reorder_level: reorderLevel || null,
        reorder_qty: reorderQty || null,
        safety_stock: safetyStock || null,
        lead_time_days: leadTime ? Number(leadTime) : null,
        lot_size_method: lotMethod || null,
        fixed_lot_size: fixedLot || null,
        preferred_vendor_id: preferredVendor ? Number(preferredVendor) : null,
        planning_time_fence_days: fence ? Number(fence) : null,
      });
      setMsg("Planning fields saved");
      onSaved();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={autoReorder} onChange={(e) => setAutoReorder(e.target.checked)} />
        <span>
          <strong>Auto Reorder Enabled</strong>
          <br />
          <span className="text-xs text-gray-500">
            When checked, the system suggests POs when stock falls below reorder level.
          </span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Reorder level
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Reorder qty (blank = auto)
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={reorderQty}
            onChange={(e) => setReorderQty(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Safety stock
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={safetyStock}
            onChange={(e) => setSafetyStock(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Lead time (days)
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Lot size method
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={lotMethod}
            onChange={(e) => setLotMethod(e.target.value)}
          >
            <option value="L4L">L4L</option>
            <option value="FIXED">FIXED</option>
            <option value="EOQ">EOQ</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Fixed lot size
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={fixedLot}
            onChange={(e) => setFixedLot(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Preferred vendor ID
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={preferredVendor}
            onChange={(e) => setPreferredVendor(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Planning time fence (days)
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={fence}
            onChange={(e) => setFence(e.target.value)}
          />
        </label>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save planning"}
      </button>
    </form>
  );
}
