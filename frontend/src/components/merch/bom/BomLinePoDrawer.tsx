import { useEffect, useState } from "react";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { api } from "@/api/client";
import { fetchVendorPage, hydrateVendor } from "@/lib/remoteSelectFetchers";
import type { CreatePoFromOrderBomLinePayload, OrderDrivenBomLine } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function BomLinePoDrawer({
  open,
  line,
  currencyDefault,
  onClose,
  onCreated,
}: {
  open: boolean;
  line: OrderDrivenBomLine | null;
  currencyDefault: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [suggestions, setSuggestions] = useState<
    Array<{ vendor_id: number | null; vendor_name: string | null; unit_price: string }>
  >([]);

  useEffect(() => {
    if (!open || !line) return;
    const gross = line.required_gross_qty ?? 0;
    setQty(gross > 0 ? String(gross) : "1");
    setUnitPrice(line.bom_expected_unit_price != null ? String(line.bom_expected_unit_price) : "");
    setCurrency(currencyDefault || line.quoted_currency || "");
    setVendorId(line.preferred_vendor_id ?? "");
    setErr("");
    void api.listWarehouses().then((w) => setWarehouses(w.map((x) => ({ id: x.id, name: x.name }))));
    void (async () => {
      if (!line.item_id) {
        setSuggestions([]);
        return;
      }
      try {
        const r = await api.getSuggestedVendorsForOrderBomLine(line.id);
        setSuggestions(r.suggestions);
      } catch (e) {
        logApiError("BomLinePoDrawer.suggestions", e);
        setSuggestions([]);
      }
    })();
  }, [open, line, currencyDefault]);

  if (!open || !line) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => !saving && onClose()}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface-raised p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Create PO from line</h3>
            <p className="text-xs text-text-muted">{line.item_code_snapshot || line.description_snapshot || `Line #${line.id}`}</p>
          </div>
          <button type="button" className="text-sm text-text-muted hover:text-text-primary" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        {err ? <div className="mt-2 rounded border border-status-danger/20 bg-status-danger-subtle px-2 py-1 text-xs text-status-danger-foreground">{err}</div> : null}

        {suggestions.length > 0 ? (
          <div className="mt-3 rounded-lg border border-border bg-surface-subtle/40 p-2">
            <div className="text-xs font-medium text-text-muted">Recent vendor prices</div>
            <ul className="mt-1 space-y-1 text-xs">
              {suggestions.slice(0, 5).map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="text-left text-brand-primary hover:underline"
                    onClick={() => {
                      if (s.vendor_id) setVendorId(s.vendor_id);
                      setUnitPrice(s.unit_price);
                    }}
                  >
                    {s.vendor_name || "Vendor"} · {s.unit_price}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-text-muted">Quantity</label>
            <input
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="mt-0.5 text-[11px] text-text-muted">Suggested gross qty: {line.required_gross_qty ?? "—"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Vendor</label>
            <RemoteSearchSelect
              value={vendorId}
              onChange={(id) => setVendorId(id)}
              placeholder="Search vendor…"
              fetchPage={fetchVendorPage}
              hydrateById={hydrateVendor}
              pageSize={40}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Unit price</label>
            <input
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Currency</label>
            <input
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Warehouse (optional)</label>
            <select
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={warehouseId === "" ? "" : String(warehouseId)}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Default</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
            disabled={saving || !line.item_id}
            title={!line.item_id ? "Link an inventory item on the line first" : undefined}
            onClick={async () => {
              const q = Number(qty);
              if (!Number.isFinite(q) || q <= 0) {
                setErr("Enter a valid quantity");
                return;
              }
              setSaving(true);
              setErr("");
              try {
                const payload: CreatePoFromOrderBomLinePayload = {
                  quantity: q,
                  unit_price: unitPrice || "0",
                  currency: currency.trim() || null,
                  vendor_id: vendorId === "" ? null : vendorId,
                  warehouse_id: warehouseId === "" ? null : warehouseId,
                };
                await api.createPurchaseOrderFromOrderBomLine(line.id, payload);
                onCreated();
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed to create PO");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Creating…" : "Create draft PO"}
          </button>
        </div>
      </div>
    </div>
  );
}
