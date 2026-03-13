import { useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItemCreate,
  type InventoryItemResponse,
  type ItemCategoryCreate,
  type ItemCategoryResponse,
  type ItemSubcategoryCreate,
  type ItemSubcategoryResponse,
  type ItemUnitCreate,
  type ItemUnitResponse,
} from "@/api/client";

export function InventoryItemsPage() {
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
  const [subcategories, setSubcategories] = useState<ItemSubcategoryResponse[]>([]);
  const [units, setUnits] = useState<ItemUnitResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [categoryForm, setCategoryForm] = useState<ItemCategoryCreate>({ category_code: "", name: "" });
  const [subcategoryForm, setSubcategoryForm] = useState<ItemSubcategoryCreate>({
    category_id: 0,
    subcategory_code: "",
    name: "",
  });
  const [unitForm, setUnitForm] = useState<ItemUnitCreate>({ unit_code: "", name: "" });
  const [itemForm, setItemForm] = useState<InventoryItemCreate>({
    item_code: "",
    name: "",
    category_id: 0,
    subcategory_id: null,
    unit_id: 0,
    default_cost: "0",
  });

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [cat, sub, uni, itm] = await Promise.all([
        api.listInventoryItemCategories(),
        api.listInventoryItemSubcategories(),
        api.listInventoryItemUnits(),
        api.listInventoryItems(),
      ]);
      setCategories(cat);
      setSubcategories(sub);
      setUnits(uni);
      setItems(itm);
      const firstCategory = cat[0];
      const firstUnit = uni[0];
      if (!subcategoryForm.category_id && firstCategory) {
        setSubcategoryForm((prev) => ({ ...prev, category_id: firstCategory.id }));
      }
      if (!itemForm.category_id && firstCategory) {
        setItemForm((prev) => ({ ...prev, category_id: firstCategory.id }));
      }
      if (!itemForm.unit_id && firstUnit) {
        setItemForm((prev) => ({ ...prev, unit_id: firstUnit.id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory masters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInventoryItemCategory(categoryForm);
    setCategoryForm({ category_code: "", name: "" });
    await load();
  };

  const submitSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInventoryItemSubcategory(subcategoryForm);
    setSubcategoryForm((prev) => ({ ...prev, subcategory_code: "", name: "" }));
    await load();
  };

  const submitUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInventoryItemUnit(unitForm);
    setUnitForm({ unit_code: "", name: "" });
    await load();
  };

  const submitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInventoryItem(itemForm);
    setItemForm((prev) => ({ ...prev, item_code: "", name: "", default_cost: "0" }));
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Items & Stock Masters</h1>
        <p className="text-sm text-gray-500">Manage categories, subcategories, units, and inventory items.</p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading…</div>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <form onSubmit={submitCategory} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h2 className="font-semibold text-gray-900">Add Category</h2>
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Code (e.g. FAB) **" value={categoryForm.category_code} onChange={(e) => setCategoryForm((p) => ({ ...p, category_code: e.target.value }))} required />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Name **" value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} required />
              <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Category</button>
            </form>

            <form onSubmit={submitSubcategory} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h2 className="font-semibold text-gray-900">Add Subcategory</h2>
              <select className="w-full rounded border px-3 py-2 text-sm" value={subcategoryForm.category_id} onChange={(e) => setSubcategoryForm((p) => ({ ...p, category_id: Number(e.target.value) }))} required>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Code (e.g. COTTON) **" value={subcategoryForm.subcategory_code} onChange={(e) => setSubcategoryForm((p) => ({ ...p, subcategory_code: e.target.value }))} required />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Name **" value={subcategoryForm.name} onChange={(e) => setSubcategoryForm((p) => ({ ...p, name: e.target.value }))} required />
              <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Subcategory</button>
            </form>

            <form onSubmit={submitUnit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h2 className="font-semibold text-gray-900">Add Unit</h2>
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Code (e.g. PCS) **" value={unitForm.unit_code} onChange={(e) => setUnitForm((p) => ({ ...p, unit_code: e.target.value }))} required />
              <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Name **" value={unitForm.name} onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))} required />
              <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Unit</button>
            </form>
          </div>

          <form onSubmit={submitItem} className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <h2 className="font-semibold text-gray-900 mb-1 sm:col-span-2 lg:col-span-3 xl:col-span-6">Add Item</h2>
            <input className="rounded border px-3 py-2 text-sm" placeholder="Item code **" value={itemForm.item_code} onChange={(e) => setItemForm((p) => ({ ...p, item_code: e.target.value }))} required />
            <input className="rounded border px-3 py-2 text-sm" placeholder="Item name **" value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} required />
            <select className="rounded border px-3 py-2 text-sm" value={itemForm.category_id} onChange={(e) => setItemForm((p) => ({ ...p, category_id: Number(e.target.value) }))} required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="rounded border px-3 py-2 text-sm" value={itemForm.subcategory_id ?? ""} onChange={(e) => setItemForm((p) => ({ ...p, subcategory_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">No subcategory</option>
              {subcategories.filter((s) => s.category_id === itemForm.category_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="rounded border px-3 py-2 text-sm" value={itemForm.unit_id} onChange={(e) => setItemForm((p) => ({ ...p, unit_id: Number(e.target.value) }))} required>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input className="flex-1 rounded border px-3 py-2 text-sm" placeholder="Default cost" value={itemForm.default_cost ?? "0"} onChange={(e) => setItemForm((p) => ({ ...p, default_cost: e.target.value }))} />
              <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Add</button>
            </div>
          </form>

          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Unit</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Default Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-sm text-gray-900">{row.item_code}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{row.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{categoryMap.get(row.category_id) || "—"}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{unitMap.get(row.unit_id) || "—"}</td>
                    <td className="px-3 py-2 text-sm text-right text-gray-700">{row.default_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
