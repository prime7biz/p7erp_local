import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type PackingCartonLine, type PackingCartons } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type Row = {
  key: number;
  carton_from: string;
  carton_to: string;
  color_name: string;
  size: string;
  pcs_per_carton: string;
  net: string;
  gross: string;
  l: string;
  w: string;
  h: string;
};

let nextKey = 1;
/** "10.400" -> "10.4" so values fit the narrow inputs. */
const num = (v: string | null | undefined) => (v == null || v === "" ? "" : String(Number(v)));
const toRow = (l: PackingCartonLine): Row => ({
  key: nextKey++,
  carton_from: String(l.carton_from),
  carton_to: String(l.carton_to),
  color_name: l.color_name,
  size: l.size,
  pcs_per_carton: String(l.pcs_per_carton),
  net: num(l.net_kg_per_carton),
  gross: num(l.gross_kg_per_carton),
  l: num(l.length_cm),
  w: num(l.width_cm),
  h: num(l.height_cm),
});
const n = (v: string) => (v.trim() === "" ? null : v.trim());
const cell = "w-full min-w-[4.5rem] rounded border border-border px-1.5 py-1 text-right text-sm tabular-nums";
const textCell = "w-full rounded border border-border px-1.5 py-1 text-left text-sm";

/** Carton-wise packing detail with live totals and the order's remaining balance by colour/size. */
export function PackingCartonsEditor({ packingListId, onSaved }: { packingListId: number; onSaved?: () => void }) {
  const [data, setData] = useState<PackingCartons | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((d: PackingCartons) => {
    setData(d);
    setRows(d.lines.map(toRow));
    setDirty(false);
  }, []);

  useEffect(() => {
    api.getPackingCartons(packingListId).then(apply).catch((e) => logApiError("PackingCartonsEditor.load", e));
  }, [packingListId, apply]);

  const live = useMemo(() => {
    const seen = new Set<string>();
    let cartons = 0;
    let pcs = 0;
    for (const r of rows) {
      const from = Number(r.carton_from);
      const to = Number(r.carton_to);
      const count = Number.isFinite(from) && Number.isFinite(to) && to >= from && from >= 1 ? to - from + 1 : 0;
      const range = `${from}-${to}`;
      if (!seen.has(range)) {
        seen.add(range);
        cartons += count;
      }
      pcs += count * (Number(r.pcs_per_carton) || 0);
    }
    return { cartons, pcs };
  }, [rows]);

  if (!data || !data.enabled) return null;
  const locked = data.locked;

  const update = (key: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  const addRow = (copyOf?: Row) => {
    const last = rows[rows.length - 1];
    const startNext = last ? String((Number(last.carton_to) || 0) + 1) : "1";
    setRows((prev) => [
      ...prev,
      copyOf
        ? { ...copyOf, key: nextKey++, size: "" }
        : { key: nextKey++, carton_from: startNext, carton_to: startNext, color_name: last?.color_name ?? "", size: "", pcs_per_carton: last?.pcs_per_carton ?? "", net: "", gross: "", l: last?.l ?? "", w: last?.w ?? "", h: last?.h ?? "" },
    ]);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.savePackingCartons(packingListId, {
        sync_header: true,
        lines: rows.map((r) => ({
          carton_from: Number(r.carton_from),
          carton_to: Number(r.carton_to),
          color_name: r.color_name.trim(),
          size: r.size.trim(),
          pcs_per_carton: Number(r.pcs_per_carton),
          net_kg_per_carton: n(r.net),
          gross_kg_per_carton: n(r.gross),
          length_cm: n(r.l),
          width_cm: n(r.w),
          height_cm: n(r.h),
        })),
      });
      apply(saved);
      toast.success("Carton detail saved; header cartons and weights updated");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save cartons");
    } finally {
      setSaving(false);
    }
  };

  const headers = ["Carton from", "to", "Colour", "Size", "Pcs / ctn", "Net kg / ctn", "Gross kg / ctn", "L cm", "W cm", "H cm", ""];

  return (
    <section aria-labelledby="ctn-title" className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <div>
        <h2 id="ctn-title" className="text-sm font-semibold text-text-primary">Carton detail</h2>
        <p className="text-xs text-text-muted">
          One row per carton range and colour/size. For assorted cartons, add several rows with the same carton range (use the copy
          button). Weights and size are per carton and are read from the first row of each range.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-xs text-text-muted">
            <tr>{headers.map((h, i) => <th key={i} scope="col" className="px-1.5 py-1.5 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-2 py-4 text-center text-text-muted">No cartons yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="border-t border-border-subtle">
                  <td className="px-1 py-1 w-20"><input aria-label="Carton from" disabled={locked} type="number" min={1} value={r.carton_from} onChange={(e) => update(r.key, "carton_from", e.target.value)} className={cell} /></td>
                  <td className="px-1 py-1 w-20"><input aria-label="Carton to" disabled={locked} type="number" min={1} value={r.carton_to} onChange={(e) => update(r.key, "carton_to", e.target.value)} className={cell} /></td>
                  <td className="px-1 py-1 min-w-[8rem]"><input aria-label="Colour" disabled={locked} maxLength={100} value={r.color_name} onChange={(e) => update(r.key, "color_name", e.target.value)} className={textCell} /></td>
                  <td className="px-1 py-1 w-20"><input aria-label="Size" disabled={locked} maxLength={16} value={r.size} onChange={(e) => update(r.key, "size", e.target.value)} className={`${textCell} min-w-[3.5rem]`} /></td>
                  <td className="px-1 py-1 w-20"><input aria-label="Pieces per carton" disabled={locked} type="number" min={1} value={r.pcs_per_carton} onChange={(e) => update(r.key, "pcs_per_carton", e.target.value)} className={cell} /></td>
                  {(["net", "gross", "l", "w", "h"] as const).map((f) => (
                    <td key={f} className="px-1 py-1 w-20">
                      <input aria-label={f} disabled={locked} type="number" min={0} step="0.01" value={r[f]} onChange={(e) => update(r.key, f, e.target.value)} className={cell} />
                    </td>
                  ))}
                  <td className="px-1 py-1 whitespace-nowrap">
                    {!locked ? (
                      <>
                        <button type="button" aria-label="Add another size to this carton range" title="Assorted: same cartons, another size" onClick={() => addRow(r)} className="rounded p-1 text-text-muted hover:text-brand-primary"><Copy className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Remove row" onClick={() => { setRows((p) => p.filter((x) => x.key !== r.key)); setDirty(true); }} className="rounded p-1 text-text-muted hover:text-status-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted" role="status">
          {live.cartons.toLocaleString()} cartons · {live.pcs.toLocaleString()} pcs
          {!dirty ? ` · net ${Number(data.summary.net_kg).toLocaleString()} kg · gross ${Number(data.summary.gross_kg).toLocaleString()} kg · ${data.summary.cbm} CBM` : " · save to recalculate weights and CBM"}
        </p>
        {!locked ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => addRow()} className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add carton range
            </button>
            <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Save cartons
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Finalized — carton detail is read-only.</p>
        )}
      </div>

      {data.breakdown.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <caption className="py-1 text-left text-xs font-semibold text-text-secondary">
              By colour / size{data.order_code ? ` — order ${data.order_code}` : ""}
            </caption>
            <thead className="text-text-muted">
              <tr>
                {["Colour", "Size", "In this list", "All lists for order", "Ordered", "Left to pack"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((b) => (
                <tr key={`${b.color_name}|${b.size}`} className="border-t border-border-subtle tabular-nums">
                  <td className="px-2 py-1">{b.color_name}</td>
                  <td className="px-2 py-1">{b.size}</td>
                  <td className="px-2 py-1">{b.packed_this_list.toLocaleString()}</td>
                  <td className="px-2 py-1">{b.packed_all_lists.toLocaleString()}</td>
                  <td className="px-2 py-1">{b.ordered_qty == null ? "—" : b.ordered_qty.toLocaleString()}</td>
                  <td className={`px-2 py-1 font-semibold ${b.balance_to_pack != null && b.balance_to_pack < 0 ? "text-status-danger-foreground" : ""}`}>
                    {b.balance_to_pack == null ? "—" : b.balance_to_pack < 0 ? `${Math.abs(b.balance_to_pack).toLocaleString()} over` : b.balance_to_pack.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
