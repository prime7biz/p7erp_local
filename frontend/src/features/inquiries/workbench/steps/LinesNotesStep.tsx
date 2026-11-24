import type { InquiryCreate, InquiryItemCreate } from "@/api/client";

const INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0";

type Props = {
  form: InquiryCreate;
  onPatch: (patch: Partial<InquiryCreate>) => void;
  onUpdateItem: (index: number, patch: Partial<InquiryItemCreate>) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
};

export function LinesNotesStep({ form, onPatch, onUpdateItem, onAddItem, onRemoveItem }: Props) {
  const items = form.items ?? [];
  const lineQtySum = items.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const headerQty = form.quantity != null ? Number(form.quantity) : null;
  const qtyMismatch =
    headerQty != null &&
    Number.isFinite(headerQty) &&
    items.some((l) => l.quantity != null) &&
    lineQtySum !== headerQty;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Step 4 — Lines & notes</h2>
            <p className="text-xs text-text-muted">Optional garment lines (colorways / SKUs) plus free notes.</p>
          </div>
          <button
            type="button"
            onClick={onAddItem}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Add line
          </button>
        </div>

        {qtyMismatch ? (
          <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
            Line quantities sum to {lineQtySum.toLocaleString()}, but header quantity is{" "}
            {headerQty.toLocaleString()}. Check before submit.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-muted">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Item name</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((line, index) => (
                <tr key={index} className="border-t border-border-subtle">
                  <td className="px-2 py-2 text-text-muted">{index + 1}</td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={line.item_name ?? ""}
                      onChange={(e) => onUpdateItem(index, { item_name: e.target.value })}
                      className={INPUT}
                      placeholder="Item"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={line.description ?? ""}
                      onChange={(e) => onUpdateItem(index, { description: e.target.value })}
                      className={INPUT}
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        onUpdateItem(index, {
                          quantity: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className={`${INPUT} text-right`}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="text-xs text-status-danger hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Notes</span>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => onPatch({ notes: e.target.value })}
            className={INPUT}
            rows={4}
            placeholder="Buyer comments, packing notes, etc."
          />
        </label>
      </div>
    </div>
  );
}
