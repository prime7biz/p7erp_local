import { useEffect, useState } from "react";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { fetchInventoryItemPage, fetchVendorPage, hydrateInventoryItem, hydrateVendor } from "@/lib/remoteSelectFetchers";
import type { OrderDrivenBomLine, OrderDrivenBomLinePatch } from "@/api/client";

export function BomLineEditDrawer({
  open,
  line,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  line: OrderDrivenBomLine | null;
  onClose: () => void;
  onSave: (patch: OrderDrivenBomLinePatch) => Promise<void>;
  saving: boolean;
}) {
  const [net, setNet] = useState("");
  const [wastage, setWastage] = useState("");
  const [processLoss, setProcessLoss] = useState("");
  const [price, setPrice] = useState("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [itemId, setItemId] = useState<number | "">("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!line || !open) return;
    setNet(line.bom_net_consumption_per_unit != null ? String(line.bom_net_consumption_per_unit) : "");
    setWastage(line.wastage_pct != null ? String(line.wastage_pct) : "0");
    setProcessLoss(line.process_loss_pct != null ? String(line.process_loss_pct) : "0");
    setPrice(line.bom_expected_unit_price != null ? String(line.bom_expected_unit_price) : "");
    setVendorId(line.preferred_vendor_id ?? "");
    setItemId(line.item_id ?? "");
    setRemarks(line.remarks ?? "");
  }, [line, open]);

  if (!open || !line) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => !saving && onClose()}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface-raised p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Edit BOM line</h3>
            <p className="text-xs text-text-muted">
              {line.item_code_snapshot || line.item_code || "—"} · {line.description_snapshot || line.description || ""}
            </p>
          </div>
          <button type="button" className="text-sm text-text-muted hover:text-text-primary" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-text-muted">Inventory item</label>
            <RemoteSearchSelect
              value={itemId}
              onChange={(id) => setItemId(id)}
              placeholder="Search item…"
              fetchPage={fetchInventoryItemPage}
              hydrateById={hydrateInventoryItem}
              pageSize={40}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Net consumption / unit</label>
            <input
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={net}
              onChange={(e) => setNet(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-text-muted">Wastage %</label>
              <input
                className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
                value={wastage}
                onChange={(e) => setWastage(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Process loss %</label>
              <input
                className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
                value={processLoss}
                onChange={(e) => setProcessLoss(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Expected unit price</label>
            <input
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Preferred vendor</label>
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
            <label className="text-xs font-medium text-text-muted">Remarks</label>
            <textarea
              className="mt-0.5 w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          {line.quoted_consumption_per_unit != null ? (
            <p className="text-xs text-text-muted">
              Quoted (per unit): {line.quoted_consumption_per_unit} · Gross after losses:{" "}
              {line.bom_gross_consumption_per_unit ?? "—"}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
            disabled={saving}
            onClick={async () => {
              const patch: OrderDrivenBomLinePatch = {
                bom_net_consumption_per_unit: net === "" ? null : Number(net),
                wastage_pct: wastage === "" ? null : Number(wastage),
                process_loss_pct: processLoss === "" ? null : Number(processLoss),
                bom_expected_unit_price: price === "" ? null : Number(price),
                preferred_vendor_id: vendorId === "" ? null : vendorId,
                item_id: itemId === "" ? null : itemId,
                remarks: remarks.trim() || null,
              };
              await onSave(patch);
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
