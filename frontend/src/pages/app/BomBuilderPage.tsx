import { useEffect, useState } from "react";
import {
  api,
  type BomResponse,
  type BomDetailResponse,
  type StyleResponse,
} from "@/api/client";

export function BomBuilderPage() {
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [boms, setBoms] = useState<BomResponse[]>([]);
  const [selectedBom, setSelectedBom] = useState<BomDetailResponse | null>(null);
  const [styleId, setStyleId] = useState<number>(0);
  const [error, setError] = useState("");
  const [itemDesc, setItemDesc] = useState("");

  const load = async () => {
    try {
      const [styleRows, bomRows] = await Promise.all([api.listStyles(), api.listBoms()]);
      setStyles(styleRows);
      setBoms(bomRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load BOM data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openBom = async (id: number) => {
    const detail = await api.getBom(id);
    setSelectedBom(detail);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BOM Builder</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create BOM versions by style and manage BOM items.</p>
        </div>
        <div className="flex gap-2">
          <select value={styleId || ""} onChange={(e) => setStyleId(Number(e.target.value) || 0)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select style…</option>
            {styles.map((s) => <option key={s.id} value={s.id}>{s.style_code} · {s.name}</option>)}
          </select>
          <button
            onClick={async () => {
              if (!styleId) return;
              await api.createBom({ style_id: styleId, status: "DRAFT", version_no: 1 });
              await load();
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            New BOM
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold">BOMs</div>
          <div className="divide-y divide-gray-100">
            {boms.map((b) => (
              <button key={b.id} onClick={() => openBom(b.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                BOM #{b.id} · Style {b.style_id} · V{b.version_no} · {b.status}
              </button>
            ))}
            {boms.length === 0 && <div className="px-4 py-6 text-sm text-gray-500">No BOM yet.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">BOM Items</h2>
          {!selectedBom ? (
            <div className="text-sm text-gray-500">Select a BOM from the left.</div>
          ) : (
            <>
              <div className="text-xs text-gray-500">BOM #{selectedBom.bom.id} · Style {selectedBom.bom.style_id}</div>
              <div className="flex gap-2">
                <input value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} placeholder="Item description" className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
                <button
                  onClick={async () => {
                    if (!itemDesc.trim()) return;
                    await api.createBomItem(selectedBom.bom.id, {
                      category: "MATERIAL",
                      description: itemDesc.trim(),
                      base_consumption: "0",
                    });
                    setItemDesc("");
                    await openBom(selectedBom.bom.id);
                  }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  Add
                </button>
              </div>
              <div className="space-y-1">
                {selectedBom.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-sm">
                    <span>{i.description || i.item_code || "Item"} · Cons {i.base_consumption}</span>
                    <button
                      onClick={async () => {
                        await api.deleteBomItem(selectedBom.bom.id, i.id);
                        await openBom(selectedBom.bom.id);
                      }}
                      className="text-xs text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {selectedBom.items.length === 0 && <div className="text-xs text-gray-500">No items yet.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
