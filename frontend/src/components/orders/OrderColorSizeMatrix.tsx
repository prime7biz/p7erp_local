import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, type OrderColorSizeMatrix as Matrix } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type Props = { orderId: number; onSaved?: () => void };

const key = (c: string, s: string) => `${c.toLowerCase()}|${s.toLowerCase()}`;

/** Colour × size quantity grid on the order page; hidden unless the company enables it. */
export function OrderColorSizeMatrix({ orderId, onSaved }: Props) {
  const [data, setData] = useState<Matrix | null>(null);
  const [colors, setColors] = useState<{ name: string; code?: string | null }[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [sync, setSync] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const apply = useCallback((m: Matrix) => {
    setData(m);
    setColors(m.colors);
    setSizes(m.sizes);
    setQty(Object.fromEntries(m.cells.map((c) => [key(c.color, c.size), c.quantity])));
    setDirty(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getOrderColorSizeMatrix(orderId)
      .then((m) => {
        if (!cancelled) apply(m);
      })
      .catch((e) => logApiError("OrderColorSizeMatrix.load", e));
    return () => {
      cancelled = true;
    };
  }, [orderId, apply]);

  const rowTotal = useCallback((c: string) => sizes.reduce((n, s) => n + (qty[key(c, s)] ?? 0), 0), [sizes, qty]);
  const colTotal = useCallback((s: string) => colors.reduce((n, c) => n + (qty[key(c.name, s)] ?? 0), 0), [colors, qty]);
  const total = useMemo(() => colors.reduce((n, c) => n + rowTotal(c.name), 0), [colors, rowTotal]);

  if (!data || !data.enabled) return null;

  const orderQty = data.order_quantity;
  const mismatch = colors.length > 0 && sizes.length > 0 && orderQty != null && total !== orderQty;

  const addColor = (name: string, code?: string | null) => {
    const n = name.trim();
    if (!n || colors.some((c) => c.name.toLowerCase() === n.toLowerCase())) return;
    setColors((prev) => [...prev, { name: n, code: code ?? null }]);
    setDirty(true);
  };
  const addSize = (s: string) => {
    const v = s.trim().slice(0, 16);
    if (!v || sizes.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setSizes((prev) => [...prev, v]);
    setDirty(true);
  };
  const useSuggestions = () => {
    data.suggested_colors.forEach((c) => addColor(c.name, c.code));
    data.suggested_sizes.forEach(addSize);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveOrderColorSizeMatrix(orderId, {
        colors,
        sizes,
        cells: colors.flatMap((c) => sizes.map((s) => ({ color: c.name, size: s, quantity: qty[key(c.name, s)] ?? 0 }))),
        sync_order_quantity: sync && !data.locked,
      });
      apply(saved);
      toast.success("Colour/size breakdown saved");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the breakdown");
    } finally {
      setSaving(false);
    }
  };

  const hasSuggestions = data.suggested_colors.length > 0 || data.suggested_sizes.length > 0;

  return (
    <section aria-labelledby="csm-title" className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="csm-title" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Grid3x3 className="h-4 w-4 text-text-muted" aria-hidden /> Colour / size breakdown
          </h2>
          <p className="text-xs text-text-muted">
            {data.locked
              ? "This order is confirmed: you can move quantities between colours and sizes, but the total must stay at the confirmed quantity."
              : "Enter pieces per colour and size. The grid total can update the order quantity when you save."}
          </p>
        </div>
        {hasSuggestions ? (
          <button
            type="button"
            onClick={useSuggestions}
            className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Use style colours &amp; sizes
          </button>
        ) : null}
      </div>

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
            placeholder="Add colour (e.g. Navy)"
            aria-label="New colour name"
            className="w-44 rounded-lg border border-border-strong px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded-lg border border-border-strong px-2 text-xs text-text-secondary hover:bg-surface-subtle" aria-label="Add colour">
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
            placeholder="Add size (e.g. XL)"
            aria-label="New size"
            className="w-32 rounded-lg border border-border-strong px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded-lg border border-border-strong px-2 text-xs text-text-secondary hover:bg-surface-subtle" aria-label="Add size">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {colors.length === 0 || sizes.length === 0 ? (
        <div className="space-y-2 rounded-lg bg-surface-subtle px-3 py-4 text-xs text-text-muted">
          {[
            { label: "Colours", items: colors.map((c) => c.name), remove: (v: string) => setColors((p) => p.filter((x) => x.name !== v)) },
            { label: "Sizes", items: sizes, remove: (v: string) => setSizes((p) => p.filter((x) => x !== v)) },
          ].map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 font-semibold text-text-secondary">{group.label}</span>
              {group.items.length === 0 ? (
                <span className="italic">none yet</span>
              ) : (
                group.items.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-text-secondary">
                    {v}
                    <button
                      type="button"
                      aria-label={`Remove ${v}`}
                      onClick={() => {
                        group.remove(v);
                        setDirty(true);
                      }}
                      className="text-text-muted hover:text-status-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          ))}
          <p>Add at least one colour and one size to start the grid.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-subtle text-xs text-text-muted">
                <th scope="col" className="sticky left-0 bg-surface-subtle px-2 py-1.5 text-left font-semibold">Colour</th>
                {sizes.map((s) => (
                  <th key={s} scope="col" className="px-2 py-1.5 text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {s}
                      <button
                        type="button"
                        aria-label={`Remove size ${s}`}
                        onClick={() => {
                          setSizes((prev) => prev.filter((x) => x !== s));
                          setDirty(true);
                        }}
                        className="rounded p-0.5 text-text-muted hover:text-status-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c.name} className="border-t border-border-subtle">
                  <th scope="row" className="sticky left-0 bg-surface-raised px-2 py-1 text-left font-medium text-text-primary">
                    <span className="inline-flex items-center gap-1">
                      {c.name}
                      <button
                        type="button"
                        aria-label={`Remove colour ${c.name}`}
                        onClick={() => {
                          setColors((prev) => prev.filter((x) => x.name !== c.name));
                          setDirty(true);
                        }}
                        className="rounded p-0.5 text-text-muted hover:text-status-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${c.name} size ${s} quantity`}
                        value={qty[key(c.name, s)] ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setQty((prev) => ({ ...prev, [key(c.name, s)]: v }));
                          setDirty(true);
                        }}
                        className="w-20 rounded border border-border px-1.5 py-1 text-right tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{rowTotal(c.name).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-subtle text-xs font-semibold">
                <th scope="row" className="sticky left-0 bg-surface-subtle px-2 py-1.5 text-left">Total</th>
                {sizes.map((s) => (
                  <td key={s} className="px-2 py-1.5 text-right tabular-nums">{colTotal(s).toLocaleString()}</td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${mismatch ? "text-status-warning-foreground" : "text-text-muted"}`} role="status">
          Grid total {total.toLocaleString()}
          {orderQty != null ? ` · order quantity ${orderQty.toLocaleString()}` : ""}
          {mismatch ? (data.locked ? " — must match before saving" : " — they differ") : ""}
        </p>
        <div className="flex items-center gap-3">
          {!data.locked ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
              Set order quantity to grid total
            </label>
          ) : null}
          <button
            type="button"
            disabled={saving || !dirty || (data.locked && mismatch)}
            title={data.locked && mismatch ? "Make the grid total equal the confirmed order quantity first" : undefined}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save breakdown
          </button>
        </div>
      </div>
    </section>
  );
}
