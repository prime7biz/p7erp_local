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
  type WarehouseCreate,
  type WarehouseResponse,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Layers, FolderTree, Plus, X, Scale, Building2 } from "lucide-react";

type TabId = "masters" | "units" | "warehouses" | "items";

export function InventoryItemsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("items");
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
  const [subcategories, setSubcategories] = useState<ItemSubcategoryResponse[]>([]);
  const [units, setUnits] = useState<ItemUnitResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [editingItem, setEditingItem] = useState<InventoryItemResponse | null>(null);
  const [editForm, setEditForm] = useState<InventoryItemCreate | null>(null);
  const [editingUnit, setEditingUnit] = useState<ItemUnitResponse | null>(null);
  const [unitEditForm, setUnitEditForm] = useState<ItemUnitCreate | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseResponse | null>(null);
  const [warehouseEditForm, setWarehouseEditForm] = useState<WarehouseCreate | null>(null);
  const [openUnitActionsId, setOpenUnitActionsId] = useState<number | null>(null);
  const [openWarehouseActionsId, setOpenWarehouseActionsId] = useState<number | null>(null);
  const [openItemActionsId, setOpenItemActionsId] = useState<number | null>(null);

  const [categoryForm, setCategoryForm] = useState<ItemCategoryCreate>({ category_code: "", name: "" });
  const [subcategoryForm, setSubcategoryForm] = useState<ItemSubcategoryCreate>({
    category_id: 0,
    subcategory_code: "",
    name: "",
  });
  const [unitForm, setUnitForm] = useState<ItemUnitCreate>({ unit_code: "", name: "" });
  const [warehouseForm, setWarehouseForm] = useState<WarehouseCreate>({
    warehouse_code: "",
    name: "",
    address: "",
  });
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
      const [cat, sub, uni, wh, itm] = await Promise.all([
        api.listInventoryItemCategories(),
        api.listInventoryItemSubcategories(),
        api.listInventoryItemUnits(),
        api.listWarehouses(),
        api.listInventoryItems(),
      ]);
      setCategories(cat);
      setSubcategories(sub);
      setUnits(uni);
      setWarehouses(wh);
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

  useEffect(() => {
    const closeActions = () => {
      setOpenUnitActionsId(null);
      setOpenWarehouseActionsId(null);
      setOpenItemActionsId(null);
    };
    document.addEventListener("click", closeActions);
    return () => document.removeEventListener("click", closeActions);
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        r.item_code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (categoryMap.get(r.category_id) ?? "").toLowerCase().includes(q)
    );
  }, [items, itemSearch, categoryMap]);

  const filteredUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.unit_code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  }, [units, unitSearch]);

  const filteredWarehouses = useMemo(() => {
    const q = warehouseSearch.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(
      (w) =>
        w.warehouse_code.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        (w.address ?? "").toLowerCase().includes(q)
    );
  }, [warehouses, warehouseSearch]);

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

  const submitWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createWarehouse(warehouseForm);
    setWarehouseForm({ warehouse_code: "", name: "", address: "" });
    await load();
  };

  const openUnitEdit = (row: ItemUnitResponse) => {
    setEditingUnit(row);
    setUnitEditForm({ unit_code: row.unit_code, name: row.name });
  };
  const closeUnitEdit = () => {
    setEditingUnit(null);
    setUnitEditForm(null);
  };
  const saveUnitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit || !unitEditForm) return;
    try {
      await api.updateInventoryItemUnit(editingUnit.id, unitEditForm);
      closeUnitEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update unit");
    }
  };
  const deleteUnit = async (row: ItemUnitResponse) => {
    if (!window.confirm(`Delete unit "${row.unit_code} – ${row.name}"?`)) return;
    try {
      await api.deleteInventoryItemUnit(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete unit");
    }
  };

  const openWarehouseEdit = (row: WarehouseResponse) => {
    setEditingWarehouse(row);
    setWarehouseEditForm({
      warehouse_code: row.warehouse_code,
      name: row.name,
      address: row.address ?? "",
    });
  };
  const closeWarehouseEdit = () => {
    setEditingWarehouse(null);
    setWarehouseEditForm(null);
  };
  const saveWarehouseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWarehouse || !warehouseEditForm) return;
    try {
      await api.updateWarehouse(editingWarehouse.id, warehouseEditForm);
      closeWarehouseEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update warehouse");
    }
  };
  const deleteWarehouse = async (row: WarehouseResponse) => {
    if (!window.confirm(`Delete warehouse "${row.warehouse_code} – ${row.name}"?`)) return;
    try {
      await api.deleteWarehouse(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete warehouse");
    }
  };

  const submitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createInventoryItem(itemForm);
    setItemForm((prev) => ({ ...prev, item_code: "", name: "", default_cost: "0" }));
    await load();
  };

  const openEdit = (row: InventoryItemResponse) => {
    setEditingItem(row);
    setEditForm({
      item_code: row.item_code,
      name: row.name,
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      unit_id: row.unit_id,
      default_cost: row.default_cost ?? "0",
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm) return;
    try {
      await api.updateInventoryItem(editingItem.id, editForm);
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
    }
  };

  const deleteItem = async (row: InventoryItemResponse) => {
    if (!window.confirm(`Delete item "${row.item_code} – ${row.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteInventoryItem(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const tabs = [
    { id: "masters" as const, label: "Masters", icon: Layers },
    { id: "units" as const, label: "Units", icon: Scale },
    { id: "warehouses" as const, label: "Warehouses", icon: Building2 },
    { id: "items" as const, label: "Items", icon: Package },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Stock Master</h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage categories, subcategories, units, and inventory items.
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-surface-raised p-1 shadow-sm">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-brand-primary text-brand-primary-foreground shadow-sm"
                  : "border-border text-text-secondary hover:bg-surface-subtle"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-text-muted">Loading…</p>
          </CardContent>
        </Card>
      )}

      {!loading && activeTab === "masters" && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderTree className="h-4 w-4 text-text-muted" />
                Add Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitCategory} className="space-y-3">
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Code (e.g. FAB)"
                  value={categoryForm.category_code}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, category_code: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Button type="submit" size="sm" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Category
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-text-muted" />
                Add Subcategory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitSubcategory} className="space-y-3">
                <select
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  value={subcategoryForm.category_id}
                  onChange={(e) => setSubcategoryForm((p) => ({ ...p, category_id: Number(e.target.value) }))}
                  required
                >
                  {categories.length === 0 && <option value={0}>Add a category first</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Code (e.g. COTTON)"
                  value={subcategoryForm.subcategory_code}
                  onChange={(e) => setSubcategoryForm((p) => ({ ...p, subcategory_code: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Name"
                  value={subcategoryForm.name}
                  onChange={(e) => setSubcategoryForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Button type="submit" size="sm" className="w-full" disabled={categories.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Subcategory
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-text-muted" />
                Add Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitUnit} className="space-y-3">
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Code (e.g. PCS)"
                  value={unitForm.unit_code}
                  onChange={(e) => setUnitForm((p) => ({ ...p, unit_code: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Name"
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Button type="submit" size="sm" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Unit
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && activeTab === "units" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-4 w-4 text-text-muted" />
                Add Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitUnit} className="space-y-3">
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Code (e.g. PCS)"
                  value={unitForm.unit_code}
                  onChange={(e) => setUnitForm((p) => ({ ...p, unit_code: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Name"
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <Button type="submit" size="sm" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Unit
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">All Units</CardTitle>
              <input
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm sm:w-64 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                placeholder="Search by code or name…"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-border bg-surface-subtle text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Name
                      </th>
                      <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredUnits.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-sm text-text-muted">
                          {units.length === 0
                            ? "No units yet. Add one using the form above."
                            : "No units match your search."}
                        </td>
                      </tr>
                    )}
                    {filteredUnits.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-subtle/50">
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.unit_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenUnitActionsId((prev) => (prev === row.id ? null : row.id)); }}
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openUnitActionsId === row.id && (
                              <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => { openUnitEdit(row); setOpenUnitActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => { await deleteUnit(row); setOpenUnitActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && activeTab === "warehouses" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-text-muted" />
                Add Warehouse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitWarehouse} className="space-y-3">
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Code (e.g. WH01)"
                  value={warehouseForm.warehouse_code}
                  onChange={(e) => setWarehouseForm((p) => ({ ...p, warehouse_code: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Name"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Address (optional)"
                  value={warehouseForm.address ?? ""}
                  onChange={(e) => setWarehouseForm((p) => ({ ...p, address: e.target.value }))}
                />
                <Button type="submit" size="sm" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Warehouse
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">All Warehouses</CardTitle>
              <input
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm sm:w-64 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                placeholder="Search by code, name, or address…"
                value={warehouseSearch}
                onChange={(e) => setWarehouseSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-border bg-surface-subtle text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Address
                      </th>
                      <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredWarehouses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-muted">
                          {warehouses.length === 0
                            ? "No warehouses yet. Add one using the form above."
                            : "No warehouses match your search."}
                        </td>
                      </tr>
                    )}
                    {filteredWarehouses.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-subtle/50">
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.warehouse_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.address ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenWarehouseActionsId((prev) => (prev === row.id ? null : row.id)); }}
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openWarehouseActionsId === row.id && (
                              <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => { openWarehouseEdit(row); setOpenWarehouseActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => { await deleteWarehouse(row); setOpenWarehouseActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && activeTab === "items" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Add Item</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={submitItem}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-4"
              >
                <input
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Item code *"
                  value={itemForm.item_code}
                  onChange={(e) => setItemForm((p) => ({ ...p, item_code: e.target.value }))}
                  required
                />
                <input
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  placeholder="Item name *"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  value={itemForm.category_id}
                  onChange={(e) => setItemForm((p) => ({ ...p, category_id: Number(e.target.value) }))}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  value={itemForm.subcategory_id ?? ""}
                  onChange={(e) =>
                    setItemForm((p) => ({ ...p, subcategory_id: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">No subcategory</option>
                  {subcategories
                    .filter((s) => s.category_id === itemForm.category_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  value={itemForm.unit_id}
                  onChange={(e) => setItemForm((p) => ({ ...p, unit_id: Number(e.target.value) }))}
                  required
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    placeholder="Default cost"
                    value={itemForm.default_cost ?? "0"}
                    onChange={(e) => setItemForm((p) => ({ ...p, default_cost: e.target.value }))}
                  />
                  <Button type="submit" size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">All Items</CardTitle>
              <input
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm sm:w-64 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                placeholder="Search by code or name…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-border bg-surface-subtle text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Default Cost
                      </th>
                      <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                          {items.length === 0
                            ? "No items yet. Add one using the form above."
                            : "No items match your search."}
                        </td>
                      </tr>
                    )}
                    {filteredItems.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-subtle/50">
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.item_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {categoryMap.get(row.category_id) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{unitMap.get(row.unit_id) ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-text-secondary">{row.default_cost}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenItemActionsId((prev) => (prev === row.id ? null : row.id)); }}
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openItemActionsId === row.id && (
                              <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => { openEdit(row); setOpenItemActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => { await deleteItem(row); setOpenItemActionsId(null); }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit Item modal */}
      {editingItem && editForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/50 p-4"
          onClick={closeEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-item-title"
        >
          <Card
            className="w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-item-title" className="text-lg">
                Edit Item
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeEdit}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveEdit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.item_code}
                      onChange={(e) => setEditForm((p) => p && { ...p, item_code: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => p && { ...p, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Category</label>
                    <select
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.category_id}
                      onChange={(e) =>
                        setEditForm((p) => p && { ...p, category_id: Number(e.target.value) })
                      }
                      required
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Subcategory</label>
                    <select
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.subcategory_id ?? ""}
                      onChange={(e) =>
                        setEditForm((p) =>
                          p && { ...p, subcategory_id: e.target.value ? Number(e.target.value) : null }
                        )
                      }
                    >
                      <option value="">None</option>
                      {subcategories
                        .filter((s) => s.category_id === editForm.category_id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Unit</label>
                    <select
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.unit_id}
                      onChange={(e) => setEditForm((p) => p && { ...p, unit_id: Number(e.target.value) })}
                      required
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Default cost</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.default_cost ?? "0"}
                      onChange={(e) => setEditForm((p) => p && { ...p, default_cost: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeEdit}>
                    Cancel
                  </Button>
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Unit modal */}
      {editingUnit && unitEditForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/50 p-4"
          onClick={closeUnitEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-unit-title"
        >
          <Card
            className="w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-unit-title" className="text-lg">
                Edit Unit
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeUnitEdit}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveUnitEdit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={unitEditForm.unit_code}
                    onChange={(e) => setUnitEditForm((p) => p && { ...p, unit_code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={unitEditForm.name}
                    onChange={(e) => setUnitEditForm((p) => p && { ...p, name: e.target.value })}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeUnitEdit}>
                    Cancel
                  </Button>
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Warehouse modal */}
      {editingWarehouse && warehouseEditForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/50 p-4"
          onClick={closeWarehouseEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-warehouse-title"
        >
          <Card
            className="w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-warehouse-title" className="text-lg">
                Edit Warehouse
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeWarehouseEdit}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveWarehouseEdit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={warehouseEditForm.warehouse_code}
                    onChange={(e) =>
                      setWarehouseEditForm((p) => p && { ...p, warehouse_code: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={warehouseEditForm.name}
                    onChange={(e) => setWarehouseEditForm((p) => p && { ...p, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Address (optional)</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={warehouseEditForm.address ?? ""}
                    onChange={(e) =>
                      setWarehouseEditForm((p) => p && { ...p, address: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeWarehouseEdit}>
                    Cancel
                  </Button>
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
