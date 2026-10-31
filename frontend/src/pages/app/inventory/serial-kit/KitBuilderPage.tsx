import { useCallback, useEffect, useState } from "react";
import {
  api,
  type InventoryItemResponse,
  type ItemKitResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function KitBuilderPage() {
  const [kits, setKits] = useState<ItemKitResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [compItemId, setCompItemId] = useState(0);
  const [compQty, setCompQty] = useState("1");
  const [components, setComponents] = useState<{ item_id: number; quantity: string }[]>([]);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [k, it] = await Promise.all([api.listItemKits(), api.listInventoryItems()]);
      setKits(k);
      setItems(it);
      if (!compItemId && it[0]) setCompItemId(it[0].id);
    } catch (e) {
      logApiError("KitBuilderPage.load", e);
      setError((e as Error).message);
    }
  }, [compItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function createKit() {
    setError("");
    try {
      await api.createItemKit({
        name,
        kit_price: price,
        components,
      });
      setName("");
      setPrice("0");
      setComponents([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function addComp() {
    if (!compItemId) return;
    setComponents((prev) => [...prev, { item_id: compItemId, quantity: compQty || "1" }]);
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Kit Builder"
        description="Create sales kits — compare kit price vs component cost"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Kit name
            <input
              className="mt-1 block w-56 rounded-lg border border-gray-300 px-2 py-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Kit price
            <input
              className="mt-1 block w-32 rounded-lg border border-gray-300 px-2 py-1.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Component
            <select
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
              value={compItemId}
              onChange={(e) => setCompItemId(Number(e.target.value))}
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.item_code} — {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Qty
            <input
              className="mt-1 block w-20 rounded-lg border border-gray-300 px-2 py-1.5"
              value={compQty}
              onChange={(e) => setCompQty(e.target.value)}
            />
          </label>
          <button type="button" onClick={addComp} className="rounded-lg border px-3 py-1.5 text-sm">
            Add component
          </button>
        </div>
        <ul className="text-sm text-gray-700">
          {components.map((c, idx) => {
            const it = items.find((i) => i.id === c.item_id);
            return (
              <li key={idx}>
                {it?.item_code ?? c.item_id} × {c.quantity}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={!name || components.length === 0}
          onClick={() => void createKit()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Create kit
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Kit price</th>
              <th className="px-3 py-2 text-right">Component cost</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.id} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium">{k.kit_code}</td>
                <td className="px-3 py-2">
                  {k.name}
                  <div className="text-xs text-gray-500">
                    {(k.components || []).map((c) => `${c.item_code}×${c.quantity}`).join(", ")}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{k.kit_price}</td>
                <td className="px-3 py-2 text-right">{k.component_cost}</td>
                <td className="px-3 py-2 text-right">
                  {k.margin} ({k.margin_pct}%)
                </td>
                <td className="relative px-3 py-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenActionsId((v) => (v === k.id ? null : k.id));
                    }}
                  >
                    Actions
                  </button>
                  {openActionsId === k.id ? (
                    <div
                      className="absolute right-0 z-10 mt-1 w-36 rounded-lg border bg-white p-1 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={async () => {
                          setOpenActionsId(null);
                          try {
                            await api.updateItemKit(k.id, { is_active: !k.is_active });
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        {k.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
