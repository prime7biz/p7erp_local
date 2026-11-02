import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, type PoColorSizeGrid as Grid, type PoColorSizeLine } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const key = (c: string, s: string) => `${c.toLowerCase()}|${s.toLowerCase()}`;
const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};
/** Sum without float drift for up to 4 decimals. */
const sum = (vals: number[]) => Math.round(vals.reduce((a, b) => a + b, 0) * 10000) / 10000;

/** Colour × size breakdown per PO line (flag `po_color_size_matrix_enabled`). */
export function PoColorSizeGrid({ poId }: { poId: number }) {
  const [data, setData] = useState<Grid | null>(null);
  const [openItem, setOpenItem] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPoColorSizeGrid(poId)
      .then((g) => {
        if (!cancelled) setData(g);
      })
      .catch((e) => logApiError("PoColorSizeGrid.load", e));
    return () => {
      cancelled = true;
    };
  }, [poId]);

  if (!data || !data.enabled || data.lines.length === 0) return null;

  return (
    <section aria-labelledby="po-csg-title" className="mt-4 space-y-2 border-t border-border pt-3">
      <h4 id="po-csg-title" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Grid3x3 className="h-4 w-4 text-text-muted" aria-hidden /> Colour / size breakdown
      </h4>
      <p className="text-xs text-text-muted">
        {data.read_only
          ? `This PO is ${data.po_status}; the breakdown is read-only.`
          : data.must_match_quantity
            ? "This PO is past draft: each saved grid must total the line quantity."
            : "Split each line by colour and size. The grid does not change the PO quantity."}
      </p>
      <ul className="space-y-2">
        {data.lines.map((line) => (
          <li key={line.po_item_id} className="rounded-lg border border-border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium text-text-primary">{line.item_name}</span>{" "}
                <span className="text-xs text-text-muted">
                  {line.item_code} · qty {Number(line.quantity).toLocaleString()}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                {line.cells.length ? (
                  <span className={line.matches_quantity ? "text-emerald-700" : "text-amber-700"}>
                    Grid {Number(line.total).toLocaleString()}
                    {line.matches_quantity ? " ✓" : " — differs"}
                  </span>
                ) : (
                  <span className="text-text-muted">No breakdown</span>
                )}
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => setOpenItem(openItem === line.po_item_id ? null : line.po_item_id)}
                >
                  {openItem === line.po_item_id ? "Hide" : data.read_only ? "View" : "Edit"}
                </button>
              </span>
            </div>
            {openItem === line.po_item_id ? (
              <LineEditor poId={poId} grid={data} line={line} onSaved={(g) => setData(g)} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LineEditor({ poId, grid, line, onSaved }: { poId: number; grid: Grid; line: PoColorSizeLine; onSaved: (g: Grid) => void }) {
  const [colors, setColors] = useState(line.colors);
  const [sizes, setSizes] = useState(line.sizes);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(line.cells.map((c) => [key(c.color, c.size), c.quantity])));
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [saving, setSaving] = useState(false);
  const readOnly = grid.read_only;

  const rowTotal = useCallback((c: string) => sum(sizes.map((s) => n(qty[key(c, s)]))), [sizes, qty]);
  const colTotal = useCallback((s: string) => sum(colors.map((c) => n(qty[key(c.name, s)]))), [colors, qty]);
  const total = useMemo(() => sum(colors.map((c) => rowTotal(c.name))), [colors, rowTotal]);
  const lineQty = Number(line.quantity);
  const hasGrid = colors.length > 0 && sizes.length > 0;
  const mismatch = hasGrid && total !== lineQty;
  const blocked = grid.must_match_quantity && mismatch;

  const addColor = (name: string, code?: string | null) => {
    const v = name.trim();
    if (!v || colors.some((c) => c.name.toLowerCase() === v.toLowerCase())) return;
    setColors((p) => [...p, { name: v, code: code ?? null }]);
  };
  const addSize = (s: string) => {
    const v = s.trim().slice(0, 16);
    if (!v || sizes.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setSizes((p) => [...p, v]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const g = await api.savePoItemColorSizeGrid(poId, line.po_item_id, {
        colors,
        sizes,
        cells: colors.flatMap((c) => sizes.map((s) => ({ color: c.name, size: s, quantity: String(n(qty[key(c.name, s)])) }))),
      });
      onSaved(g);
      toast.success("Breakdown saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the breakdown");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addColor(newColor);
              setNewColor("");
            }}
          >
            <input
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              maxLength={100}
              placeholder="Add colour"
              aria-label="New colour name"
              className="w-36 rounded-lg border border-border-strong px-2 py-1 text-xs"
            />
            <button type="submit" aria-label="Add colour" className="rounded-lg border border-border-strong px-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addSize(newSize);
              setNewSize("");
            }}
          >
            <input
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              maxLength={16}
              placeholder="Add size"
              aria-label="New size"
              className="w-24 rounded-lg border border-border-strong px-2 py-1 text-xs"
            />
            <button type="submit" aria-label="Add size" className="rounded-lg border border-border-strong px-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
          {grid.suggested_colors.length || grid.suggested_sizes.length ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs text-text-secondary"
              onClick={() => {
                grid.suggested_colors.forEach((c) => addColor(c.name, c.code));
                grid.suggested_sizes.forEach(addSize);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Use order colours &amp; sizes
            </button>
          ) : null}
        </div>
      ) : null}

      {!hasGrid ? (
        <p className="rounded bg-surface-subtle px-2 py-2 text-xs text-text-muted">
          Colours: {colors.map((c) => c.name).join(", ") || "none"} · Sizes: {sizes.join(", ") || "none"}. Add at least one of each.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-surface-subtle text-text-muted">
                <th className="px-2 py-1 text-left">Colour</th>
                {sizes.map((s) => (
                  <th key={s} className="px-2 py-1 text-right">
                    <span className="inline-flex items-center gap-1">
                      {s}
                      {!readOnly ? (
                        <button type="button" aria-label={`Remove size ${s}`} onClick={() => setSizes((p) => p.filter((x) => x !== s))}>
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c.name} className="border-t border-border-subtle">
                  <th scope="row" className="px-2 py-1 text-left font-medium">
                    <span className="inline-flex items-center gap-1">
                      {c.name}
                      {!readOnly ? (
                        <button type="button" aria-label={`Remove colour ${c.name}`} onClick={() => setColors((p) => p.filter((x) => x.name !== c.name))}>
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  </th>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-0.5">
                      <input
                        inputMode="decimal"
                        disabled={readOnly}
                        aria-label={`${c.name} size ${s} quantity`}
                        value={qty[key(c.name, s)] ?? ""}
                        placeholder="0"
                        onChange={(e) => setQty((p) => ({ ...p, [key(c.name, s)]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        className="w-20 rounded border border-border px-1.5 py-0.5 text-right tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{rowTotal(c.name).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-subtle font-semibold">
                <th scope="row" className="px-2 py-1 text-left">Total</th>
                {sizes.map((s) => (
                  <td key={s} className="px-2 py-1 text-right tabular-nums">{colTotal(s).toLocaleString()}</td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums">{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`text-xs ${mismatch ? "text-amber-700" : "text-text-muted"}`} role="status">
            Grid total {total.toLocaleString()} · line quantity {lineQty.toLocaleString()}
            {mismatch ? (grid.must_match_quantity ? " — must match before saving" : " — they differ") : ""}
          </p>
          <button
            type="button"
            disabled={saving || !hasGrid || blocked}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1 text-xs font-semibold text-brand-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save breakdown
          </button>
        </div>
      ) : null}
    </div>
  );
}
