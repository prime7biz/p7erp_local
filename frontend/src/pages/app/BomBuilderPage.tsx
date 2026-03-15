import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type BomResponse,
  type BomDetailResponse,
  type StyleResponse,
  type InventoryItemResponse,
} from "@/api/client";

export function BomBuilderPage() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [boms, setBoms] = useState<BomResponse[]>([]);
  const [selectedBom, setSelectedBom] = useState<BomDetailResponse | null>(null);
  const [styleId, setStyleId] = useState<number>(0);
  const [error, setError] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItemResponse[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [itemDesc, setItemDesc] = useState("");
  const [baseConsumption, setBaseConsumption] = useState("0");
  const [wastagePct, setWastagePct] = useState("");
  const [generatePOModalOpen, setGeneratePOModalOpen] = useState(false);
  const [poQuantity, setPoQuantity] = useState("100");
  const [poSupplierName, setPoSupplierName] = useState("");
  const [generatingPO, setGeneratingPO] = useState(false);

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

  useEffect(() => {
    const loadItems = async () => {
      try {
        const items = await api.listInventoryItems();
        setInventoryItems(items);
      } catch {
        setInventoryItems([]);
      }
    };
    loadItems();
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

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-900">BOM Items</h2>
          {!selectedBom ? (
            <div className="text-sm text-gray-500">Select a BOM from the left.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-gray-500">BOM #{selectedBom.bom.id} · Style {selectedBom.bom.style_id}</div>
                <button
                  type="button"
                  onClick={() => setGeneratePOModalOpen(true)}
                  className="rounded-lg border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  Generate purchase order
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Item (from inventory)</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— Free text —</option>
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.item_code} · {it.name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Description (or override)</label>
                  <input
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    placeholder={selectedItemId ? "Optional override" : "Required if no item selected"}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm min-w-0"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Base consumption</label>
                  <input
                    type="text"
                    value={baseConsumption}
                    onChange={(e) => setBaseConsumption(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Wastage %</label>
                  <input
                    type="text"
                    value={wastagePct}
                    onChange={(e) => setWastagePct(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={async () => {
                    const hasItem = selectedItemId !== "";
                    const hasDesc = itemDesc.trim() !== "";
                    if (!hasItem && !hasDesc) return;
                    setError("");
                    try {
                      await api.createBomItem(selectedBom.bom.id, {
                        item_id: hasItem ? Number(selectedItemId) : undefined,
                        category: "MATERIAL",
                        description: hasDesc ? itemDesc.trim() : undefined,
                        base_consumption: baseConsumption.trim() || "0",
                        wastage_pct: wastagePct.trim() || undefined,
                      });
                      setSelectedItemId("");
                      setItemDesc("");
                      setBaseConsumption("0");
                      setWastagePct("");
                      await openBom(selectedBom.bom.id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to add BOM item");
                    }
                  }}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 shrink-0"
                >
                  Add line
                </button>
              </div>
              {selectedBom.items.length === 0 ? (
                <div className="text-xs text-gray-500">No items yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
                      <tr>
                        <th className="py-2 px-3">Item / Description</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">UOM</th>
                        <th className="py-2 px-3">Consumption</th>
                        <th className="py-2 px-3">Wastage %</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBom.items.map((i) => (
                        <tr key={i.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 px-3 text-gray-800">
                            {i.item_id != null ? (
                              <span title={`Item #${i.item_id}`}>{i.item_code ?? i.description ?? "—"}</span>
                            ) : (
                              i.description || i.item_code || "—"
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-600">{i.category ?? "—"}</td>
                          <td className="py-2 px-3 text-gray-600">{i.uom ?? "—"}</td>
                          <td className="py-2 px-3 text-gray-700">{i.base_consumption}</td>
                          <td className="py-2 px-3 text-gray-600">{i.wastage_pct ?? "—"}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await api.deleteBomItem(selectedBom.bom.id, i.id);
                                await openBom(selectedBom.bom.id);
                              }}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {generatePOModalOpen && selectedBom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !generatingPO && setGeneratePOModalOpen(false)}>
          <div
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-lg w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Generate purchase order from BOM</h3>
            <p className="text-sm text-gray-500 mb-4">
              Creates a draft PO with lines for each BOM item linked to inventory. Quantity × consumption × (1 + wastage %) per line.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (e.g. order qty)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={poQuantity}
                  onChange={(e) => setPoQuantity(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier name (optional)</label>
                <input
                  type="text"
                  value={poSupplierName}
                  onChange={(e) => setPoSupplierName(e.target.value)}
                  placeholder="From BOM"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !generatingPO && setGeneratePOModalOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={generatingPO || !poQuantity || Number(poQuantity) <= 0}
                onClick={async () => {
                  const qty = Number(poQuantity);
                  if (!Number.isFinite(qty) || qty <= 0) return;
                  setGeneratingPO(true);
                  setError("");
                  try {
                    const res = await api.generatePurchaseOrderFromBom(selectedBom.bom.id, {
                      quantity: qty,
                      supplier_name: poSupplierName.trim() || undefined,
                    });
                    setGeneratePOModalOpen(false);
                    navigate("/app/inventory/purchase-orders", { state: { createdPO: res } });
                    setPoQuantity("100");
                    setPoSupplierName("");
                    setGeneratingPO(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to generate PO");
                    setGeneratingPO(false);
                  }
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {generatingPO ? "Generating…" : "Generate PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
