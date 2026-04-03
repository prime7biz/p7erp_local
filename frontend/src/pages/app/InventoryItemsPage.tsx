import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type InventoryItemCreate,
  type InventoryItemResponse,
  type InventoryItemUpdate,
  type ItemCategoryCreate,
  type ItemCategoryResponse,
  type ItemCategoryUpdate,
  type ItemSubcategoryCreate,
  type ItemSubcategoryResponse,
  type ItemSubcategoryUpdate,
  type ItemUnitCreate,
  type ItemUnitResponse,
  type ItemUnitUpdate,
  type StockGroupResponse,
  type WarehouseResponse,
  type WarehouseUpdate,
} from "@/api/client";
import { StockGroupsPage } from "@/pages/app/StockGroupsPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Layers, FolderTree, Plus, X, Scale, Building2 } from "lucide-react";
import { logApiError } from "@/utils/logApiError";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
  listPageToolbarInputClass,
  erpControlFocusClass,
} from "@/components/app/listPageLayout";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { useListPagination } from "@/hooks/useListPagination";
import { cn } from "@/lib/utils";

type TabId = "masters" | "groups" | "units" | "warehouses" | "items";

const TAB_IDS: TabId[] = ["masters", "groups", "units", "warehouses", "items"];

function tabFromSearchParam(raw: string | null): TabId | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return TAB_IDS.includes(t as TabId) ? (t as TabId) : null;
}

export function InventoryItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromSearchParam(searchParams.get("tab")) ?? "items");
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
  const [subcategories, setSubcategories] = useState<ItemSubcategoryResponse[]>([]);
  const [units, setUnits] = useState<ItemUnitResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [stockGroups, setStockGroups] = useState<StockGroupResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch, setDebouncedItemSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [editingItem, setEditingItem] = useState<InventoryItemResponse | null>(null);
  const [editForm, setEditForm] = useState<InventoryItemUpdate | null>(null);
  const [editingUnit, setEditingUnit] = useState<ItemUnitResponse | null>(null);
  const [unitEditForm, setUnitEditForm] = useState<ItemUnitUpdate | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseResponse | null>(null);
  const [warehouseEditForm, setWarehouseEditForm] = useState<WarehouseUpdate & { warehouse_code: string } | null>(
    null,
  );
  const [openUnitActionsId, setOpenUnitActionsId] = useState<number | null>(null);
  const [openWarehouseActionsId, setOpenWarehouseActionsId] = useState<number | null>(null);
  const [openItemActionsId, setOpenItemActionsId] = useState<number | null>(null);
  const [openCategoryActionsId, setOpenCategoryActionsId] = useState<number | null>(null);
  const [openSubcategoryActionsId, setOpenSubcategoryActionsId] = useState<number | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [editingCategory, setEditingCategory] = useState<ItemCategoryResponse | null>(null);
  const [categoryEditForm, setCategoryEditForm] = useState<ItemCategoryUpdate | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<ItemSubcategoryResponse | null>(null);
  const [subcategoryEditForm, setSubcategoryEditForm] = useState<ItemSubcategoryUpdate | null>(null);
  const { pageSize, setPageSize } = useListPagination();
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemModalMode, setItemModalMode] = useState<"view" | "edit">("view");
  const [unitModalMode, setUnitModalMode] = useState<"view" | "edit">("view");
  const [warehouseModalMode, setWarehouseModalMode] = useState<"view" | "edit">("view");

  const [categoryForm, setCategoryForm] = useState<ItemCategoryCreate>({ name: "" });
  const [subcategoryForm, setSubcategoryForm] = useState<ItemSubcategoryCreate>({
    category_id: 0,
    name: "",
  });
  const [unitForm, setUnitForm] = useState<ItemUnitCreate>({ name: "" });
  const [warehouseForm, setWarehouseForm] = useState<{ name: string; address: string }>({
    name: "",
    address: "",
  });
  const [itemForm, setItemForm] = useState<InventoryItemCreate>({
    name: "",
    category_id: 0,
    subcategory_id: null,
    unit_id: 0,
    default_warehouse_id: null,
    stock_group_id: null,
    default_cost: "0",
  });

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  const warehouseCodeById = useMemo(
    () => new Map(warehouses.map((w) => [w.id, w.warehouse_code])),
    [warehouses],
  );
  const stockGroupLabelById = useMemo(
    () => new Map(stockGroups.map((g) => [g.id, `${g.group_code} — ${g.name}`])),
    [stockGroups],
  );
  const stockGroupById = useMemo(() => new Map(stockGroups.map((g) => [g.id, g])), [stockGroups]);
  const subcategoryNameById = useMemo(
    () => new Map(subcategories.map((s) => [s.id, s.name])),
    [subcategories],
  );

  const groupSubgroupForItem = useCallback(
    (stockGroupId: number | null | undefined): { group: string; subgroup: string } => {
      if (stockGroupId == null) return { group: "—", subgroup: "—" };
      const g = stockGroupById.get(stockGroupId);
      if (!g) return { group: `#${stockGroupId}`, subgroup: "—" };
      if (g.parent_id == null) return { group: `${g.group_code} — ${g.name}`, subgroup: "—" };
      const parent = stockGroupById.get(g.parent_id);
      const pg = parent ? `${parent.group_code} — ${parent.name}` : "—";
      return { group: pg, subgroup: `${g.group_code} — ${g.name}` };
    },
    [stockGroupById],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cat, sub, uni, wh, sg, itmPage] = await Promise.all([
        api.listInventoryItemCategories({ limit: 500 }),
        api.listInventoryItemSubcategories({ limit: 500 }),
        api.listInventoryItemUnits({ limit: 500 }),
        api.listWarehouses(),
        api.listStockGroups(),
        api.listInventoryItemsPaginated({
          page: itemPage,
          page_size: pageSize,
          search: debouncedItemSearch.trim() || undefined,
        }),
      ]);
      setCategories(cat);
      setSubcategories(sub);
      setUnits(uni);
      setWarehouses(wh);
      setStockGroups(sg);
      setItems(itmPage.items);
      setItemTotal(itmPage.total);
      const catIds = new Set(cat.map((c) => c.id));
      const unitIds = new Set(uni.map((u) => u.id));
      const firstCategory = cat[0];
      const firstUnit = uni[0];

      if (cat.length === 0) {
        setSubcategoryForm((prev) => (prev.category_id === 0 ? prev : { ...prev, category_id: 0 }));
      } else if (firstCategory) {
        setSubcategoryForm((prev) =>
          catIds.has(prev.category_id) ? prev : { ...prev, category_id: firstCategory.id },
        );
      }
      setItemForm((prev) => {
        let category_id = prev.category_id;
        let unit_id = prev.unit_id;
        if (cat.length === 0) {
          category_id = 0;
        } else if (firstCategory && !catIds.has(prev.category_id)) {
          category_id = firstCategory.id;
        }
        if (uni.length === 0) {
          unit_id = 0;
        } else if (firstUnit && !unitIds.has(unit_id)) {
          unit_id = firstUnit.id;
        }
        if (category_id === prev.category_id && unit_id === prev.unit_id) return prev;
        return { ...prev, category_id, unit_id };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory masters");
    } finally {
      setLoading(false);
    }
  }, [itemPage, pageSize, debouncedItemSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedItemSearch(itemSearch), 300);
    return () => window.clearTimeout(t);
  }, [itemSearch]);

  useEffect(() => {
    setItemPage(1);
  }, [debouncedItemSearch, pageSize]);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw != null && raw !== "") {
      const t = tabFromSearchParam(raw);
      if (t) setActiveTab(t);
    }
  }, [searchParams]);

  const itemIdFromUrl = searchParams.get("item");
  useEffect(() => {
    if (!itemIdFromUrl || loading) return;
    const id = Number(itemIdFromUrl);
    if (!Number.isFinite(id)) return;
    const row = items.find((i) => i.id === id);
    if (!row) return;
    setActiveTab("items");
    setEditingItem(row);
    setItemModalMode("view");
    setEditForm({
      name: row.name,
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      unit_id: row.unit_id,
      default_warehouse_id: row.default_warehouse_id ?? null,
      stock_group_id: row.stock_group_id ?? null,
      default_cost: row.default_cost ?? "0",
      is_active: row.is_active,
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("item");
        return next;
      },
      { replace: true },
    );
  }, [itemIdFromUrl, loading, items, setSearchParams]);

  const setTab = useCallback(
    (id: TabId) => {
      setActiveTab(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === "items") next.delete("tab");
          else next.set("tab", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const closeActions = () => {
      setOpenUnitActionsId(null);
      setOpenWarehouseActionsId(null);
      setOpenItemActionsId(null);
      setOpenCategoryActionsId(null);
      setOpenSubcategoryActionsId(null);
    };
    document.addEventListener("click", closeActions);
    return () => document.removeEventListener("click", closeActions);
  }, []);

  const filteredCategoriesForMaster = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.category_code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [categories, categorySearch]);

  const filteredSubcategoriesForMaster = useMemo(() => {
    const q = subcategorySearch.trim().toLowerCase();
    if (!q) return subcategories;
    return subcategories.filter(
      (s) =>
        s.subcategory_code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [subcategories, subcategorySearch]);

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
    setError("");
    try {
      await api.createInventoryItemCategory(categoryForm);
      setCategoryForm({ name: "" });
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.createCategory", err);
      setError(err instanceof Error ? err.message : "Failed to save category");
    }
  };

  const submitSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!subcategoryForm.category_id) {
      setError("Please select a category first.");
      return;
    }
    try {
      await api.createInventoryItemSubcategory(subcategoryForm);
      setSubcategoryForm((prev) => ({ ...prev, name: "" }));
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.createSubcategory", err);
      setError(err instanceof Error ? err.message : "Failed to save subcategory");
    }
  };

  const submitUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createInventoryItemUnit(unitForm);
      setUnitForm({ name: "" });
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.createUnit", err);
      setError(err instanceof Error ? err.message : "Failed to save unit");
    }
  };

  const submitWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createWarehouse({
        name: warehouseForm.name,
        address: warehouseForm.address.trim() || undefined,
      });
      setWarehouseForm({ name: "", address: "" });
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.createWarehouse", err);
      setError(err instanceof Error ? err.message : "Failed to save warehouse");
    }
  };

  const openUnitModal = (row: ItemUnitResponse, mode: "view" | "edit") => {
    setEditingUnit(row);
    setUnitModalMode(mode);
    setUnitEditForm({ name: row.name, description: row.description ?? undefined, is_active: row.is_active });
  };
  const closeUnitEdit = () => {
    setEditingUnit(null);
    setUnitEditForm(null);
    setUnitModalMode("view");
  };
  const backUnitToView = () => {
    if (!editingUnit) return;
    setUnitModalMode("view");
    const row = editingUnit;
    setUnitEditForm({ name: row.name, description: row.description ?? undefined, is_active: row.is_active });
  };
  const saveUnitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unitModalMode !== "edit") return;
    if (!editingUnit || !unitEditForm) return;
    try {
      await api.updateInventoryItemUnit(editingUnit.id, unitEditForm);
      closeUnitEdit();
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.updateUnit", err);
      setError(err instanceof Error ? err.message : "Failed to update unit");
    }
  };
  const deleteUnit = async (row: ItemUnitResponse) => {
    if (!window.confirm(`Delete unit "${row.unit_code} – ${row.name}"?`)) return;
    try {
      await api.deleteInventoryItemUnit(row.id);
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.deleteUnit", err);
      setError(err instanceof Error ? err.message : "Failed to delete unit");
    }
  };

  const openWarehouseModal = (row: WarehouseResponse, mode: "view" | "edit") => {
    setEditingWarehouse(row);
    setWarehouseModalMode(mode);
    setWarehouseEditForm({
      warehouse_code: row.warehouse_code,
      name: row.name,
      address: row.address ?? "",
      is_active: row.is_active,
    });
  };
  const closeWarehouseEdit = () => {
    setEditingWarehouse(null);
    setWarehouseEditForm(null);
    setWarehouseModalMode("view");
  };
  const backWarehouseToView = () => {
    if (!editingWarehouse) return;
    setWarehouseModalMode("view");
    const row = editingWarehouse;
    setWarehouseEditForm({
      warehouse_code: row.warehouse_code,
      name: row.name,
      address: row.address ?? "",
      is_active: row.is_active,
    });
  };
  const saveWarehouseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (warehouseModalMode !== "edit") return;
    if (!editingWarehouse || !warehouseEditForm) return;
    try {
      await api.updateWarehouse(editingWarehouse.id, {
        name: warehouseEditForm.name,
        address: warehouseEditForm.address?.trim() ? warehouseEditForm.address : null,
        is_active: warehouseEditForm.is_active,
      });
      closeWarehouseEdit();
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.updateWarehouse", err);
      setError(err instanceof Error ? err.message : "Failed to update warehouse");
    }
  };
  const deleteWarehouse = async (row: WarehouseResponse) => {
    if (!window.confirm(`Delete warehouse "${row.warehouse_code} – ${row.name}"?`)) return;
    try {
      await api.deleteWarehouse(row.id);
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.deleteWarehouse", err);
      setError(err instanceof Error ? err.message : "Failed to delete warehouse");
    }
  };

  const submitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!itemForm.category_id) {
      setError("Please select a category.");
      return;
    }
    if (!itemForm.unit_id) {
      setError("Please select a unit.");
      return;
    }
    try {
      await api.createInventoryItem(itemForm);
      setItemForm((prev) => ({
        ...prev,
        name: "",
        default_cost: "0",
        default_warehouse_id: null,
        stock_group_id: null,
      }));
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.createItem", err);
      setError(err instanceof Error ? err.message : "Failed to save item");
    }
  };

  const openItemModal = (row: InventoryItemResponse, mode: "view" | "edit") => {
    setEditingItem(row);
    setItemModalMode(mode);
    setEditForm({
      name: row.name,
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      unit_id: row.unit_id,
      default_warehouse_id: row.default_warehouse_id ?? null,
      stock_group_id: row.stock_group_id ?? null,
      default_cost: row.default_cost ?? "0",
      is_active: row.is_active,
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm(null);
    setItemModalMode("view");
  };

  const backItemToView = () => {
    if (!editingItem) return;
    setItemModalMode("view");
    const row = editingItem;
    setEditForm({
      name: row.name,
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      unit_id: row.unit_id,
      default_warehouse_id: row.default_warehouse_id ?? null,
      stock_group_id: row.stock_group_id ?? null,
      default_cost: row.default_cost ?? "0",
      is_active: row.is_active,
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemModalMode !== "edit") return;
    if (!editingItem || !editForm) return;
    try {
      await api.updateInventoryItem(editingItem.id, editForm);
      closeEdit();
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.updateItem", err);
      setError(err instanceof Error ? err.message : "Failed to update item");
    }
  };

  const deleteItem = async (row: InventoryItemResponse) => {
    if (!window.confirm(`Delete item "${row.item_code} – ${row.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteInventoryItem(row.id);
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.deleteItem", err);
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const deleteCategory = async (row: ItemCategoryResponse) => {
    if (!window.confirm(`Delete category "${row.name}"? Subcategories and items must be removed first.`)) return;
    try {
      await api.deleteInventoryItemCategory(row.id);
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.deleteCategory", err);
      setError(err instanceof Error ? err.message : "Failed to delete category");
    }
  };

  const openCategoryModal = (row: ItemCategoryResponse) => {
    setEditingCategory(row);
    setCategoryEditForm({
      name: row.name,
      description: row.description ?? undefined,
      is_active: row.is_active,
    });
  };
  const closeCategoryModal = () => {
    setEditingCategory(null);
    setCategoryEditForm(null);
  };
  const saveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !categoryEditForm) return;
    try {
      await api.updateInventoryItemCategory(editingCategory.id, categoryEditForm);
      closeCategoryModal();
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.updateCategory", err);
      setError(err instanceof Error ? err.message : "Failed to update category");
    }
  };

  const deleteSubcategoryRow = async (row: ItemSubcategoryResponse) => {
    if (!window.confirm(`Delete subcategory "${row.name}"?`)) return;
    try {
      await api.deleteInventoryItemSubcategory(row.id);
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.deleteSubcategory", err);
      setError(err instanceof Error ? err.message : "Failed to delete subcategory");
    }
  };

  const openSubcategoryModal = (row: ItemSubcategoryResponse) => {
    setEditingSubcategory(row);
    setSubcategoryEditForm({
      category_id: row.category_id,
      name: row.name,
      description: row.description ?? undefined,
      is_active: row.is_active,
    });
  };
  const closeSubcategoryModal = () => {
    setEditingSubcategory(null);
    setSubcategoryEditForm(null);
  };
  const saveSubcategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubcategory || !subcategoryEditForm) return;
    try {
      await api.updateInventoryItemSubcategory(editingSubcategory.id, subcategoryEditForm);
      closeSubcategoryModal();
      await load();
    } catch (err) {
      logApiError("InventoryItemsPage.updateSubcategory", err);
      setError(err instanceof Error ? err.message : "Failed to update subcategory");
    }
  };

  const tabs = [
    { id: "masters" as const, label: "Masters", icon: Layers },
    { id: "groups" as const, label: "Groups", icon: FolderTree },
    { id: "units" as const, label: "Units", icon: Scale },
    { id: "warehouses" as const, label: "Warehouses", icon: Building2 },
    { id: "items" as const, label: "Items", icon: Package },
  ];

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Stock Master"
        description="Inventory · Categories, units, warehouses, and items used by procurement, receiving, costing, and production. Menu shortcuts for Units/Warehouses land on this page—use tabs to switch."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/purchase-orders"
              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              Purchase orders
            </Link>
            <Link
              to="/app/inventory/goods-receiving"
              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              Receiving
            </Link>
          </div>
        }
        belowTitle={
          <div className="flex flex-wrap rounded-xl border border-border bg-surface-raised p-1 shadow-sm">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
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
        }
      />

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
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FolderTree className="h-4 w-4 text-text-muted" />
                  Add Category
                </CardTitle>
                <p className="text-xs text-text-muted">Code is generated automatically (e.g. CAT-0001).</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitCategory} className="space-y-3">
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
                <p className="text-xs text-text-muted">Code is generated automatically (e.g. SUBCAT-0001).</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitSubcategory} className="space-y-3">
                  <select
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                    value={subcategoryForm.category_id}
                    onChange={(e) => setSubcategoryForm((p) => ({ ...p, category_id: Number(e.target.value) }))}
                    required
                  >
                    {categories.length === 0 ? (
                      <option value={0}>Add a category first</option>
                    ) : (
                      <option value={0} disabled>
                        Select category…
                      </option>
                    )}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Categories</CardTitle>
              <input
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0 sm:w-64"
                placeholder="Search code or name…"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase text-text-muted">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="w-24 px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredCategoriesForMaster.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                          No categories yet.
                        </td>
                      </tr>
                    ) : (
                      filteredCategoriesForMaster.map((row) => (
                        <tr key={row.id} className="hover:bg-surface-subtle/50">
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.category_code}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                          <td className="px-4 py-3 text-sm">{row.is_active ? "Yes" : "No"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCategoryActionsId((prev) => (prev === row.id ? null : row.id));
                                }}
                                className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Actions
                              </button>
                              {openCategoryActionsId === row.id && (
                                <div
                                  className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openCategoryModal(row);
                                      setOpenCategoryActionsId(null);
                                    }}
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await deleteCategory(row);
                                      setOpenCategoryActionsId(null);
                                    }}
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Subcategories</CardTitle>
              <input
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0 sm:w-64"
                placeholder="Search code or name…"
                value={subcategorySearch}
                onChange={(e) => setSubcategorySearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase text-text-muted">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="w-24 px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {filteredSubcategoriesForMaster.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                          No subcategories yet.
                        </td>
                      </tr>
                    ) : (
                      filteredSubcategoriesForMaster.map((row) => (
                        <tr key={row.id} className="hover:bg-surface-subtle/50">
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.subcategory_code}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {categoryMap.get(row.category_id) ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                          <td className="px-4 py-3 text-sm">{row.is_active ? "Yes" : "No"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenSubcategoryActionsId((prev) => (prev === row.id ? null : row.id));
                                }}
                                className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Actions
                              </button>
                              {openSubcategoryActionsId === row.id && (
                                <div
                                  className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openSubcategoryModal(row);
                                      setOpenSubcategoryActionsId(null);
                                    }}
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await deleteSubcategoryRow(row);
                                      setOpenSubcategoryActionsId(null);
                                    }}
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && activeTab === "groups" && <StockGroupsPage embedded />}

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
                <p className="text-xs text-text-muted">Unit code is generated automatically (e.g. UOM-0001).</p>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm sm:w-64 focus:border-brand-primary focus:outline-none focus:ring-0"
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
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openUnitModal(row, "view")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openUnitModal(row, "view");
                          }
                        }}
                        className="cursor-pointer hover:bg-surface-subtle/50"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.unit_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                                  onClick={() => { openUnitModal(row, "edit"); setOpenUnitActionsId(null); }}
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
                <p className="text-xs text-text-muted">Warehouse code is generated automatically (e.g. WH-0001).</p>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  placeholder="Name"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm sm:w-64 focus:border-brand-primary focus:outline-none focus:ring-0"
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
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openWarehouseModal(row, "view")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openWarehouseModal(row, "view");
                          }
                        }}
                        className="cursor-pointer hover:bg-surface-subtle/50"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.warehouse_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{row.address ?? "—"}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                                  onClick={() => { openWarehouseModal(row, "edit"); setOpenWarehouseActionsId(null); }}
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
                <p className="col-span-full text-xs text-text-muted">
                  Item code is generated automatically (e.g. ITEM-000001).
                </p>
                <input
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  placeholder="Item name *"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  value={itemForm.category_id}
                  onChange={(e) => setItemForm((p) => ({ ...p, category_id: Number(e.target.value) }))}
                  required
                >
                  {categories.length === 0 ? (
                    <option value={0} disabled>
                      Add a category first
                    </option>
                  ) : (
                    <option value={0} disabled>
                      Select category…
                    </option>
                  )}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  value={itemForm.unit_id}
                  onChange={(e) => setItemForm((p) => ({ ...p, unit_id: Number(e.target.value) }))}
                  required
                >
                  {units.length === 0 ? (
                    <option value={0} disabled>
                      Add a unit first
                    </option>
                  ) : (
                    <option value={0} disabled>
                      Select unit…
                    </option>
                  )}
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  title="Default warehouse for new PO lines"
                  value={itemForm.default_warehouse_id ?? ""}
                  onChange={(e) =>
                    setItemForm((p) => ({
                      ...p,
                      default_warehouse_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Default WH (optional)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.warehouse_code} — {w.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
                  title="Stock group for GL mapping and FIFO summary"
                  value={itemForm.stock_group_id ?? ""}
                  onChange={(e) =>
                    setItemForm((p) => ({
                      ...p,
                      stock_group_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Stock group (optional)</option>
                  {stockGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.group_code} — {g.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0"
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
              <div>
                <CardTitle className="text-base">All Items</CardTitle>
                <p className="mt-1 text-xs text-text-muted">
                  Search runs on the server across your catalog. Use pagination to browse results.
                </p>
              </div>
              <input
                className={cn(listPageToolbarInputClass, "sm:w-64")}
                placeholder="Search by code or name…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              <ResponsiveTableContainer>
                <table className={cn(listTableBaseClass, "min-w-full")}>
                  <thead className={listTableTheadClass}>
                    <tr>
                      <th className={listTableThClass}>Code</th>
                      <th className={listTableThClass}>Name</th>
                      <th className={listTableThClass}>Category</th>
                      <th className={listTableThClass}>Subcategory</th>
                      <th className={listTableThClass}>Group</th>
                      <th className={listTableThClass}>Subgroup</th>
                      <th className={listTableThClass}>Unit</th>
                      <th className={listTableThClass}>Status</th>
                      <th className={listTableThClass}>Def. WH</th>
                      <th className={listTableThClass}>Stock group</th>
                      <th className={listTableThRightClass}>Default Cost</th>
                      <th className={cn(listTableThRightClass, "w-24")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={12} className={cn(listTableTdClass, "py-10 text-center")}>
                          {itemTotal === 0 && !debouncedItemSearch.trim()
                            ? "No items yet. Add one using the form above."
                            : "No items match your search. Try another term or clear search."}
                        </td>
                      </tr>
                    )}
                    {items.map((row) => {
                      const gg = groupSubgroupForItem(row.stock_group_id);
                      return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openItemModal(row, "view")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openItemModal(row, "view");
                          }
                        }}
                        className={cn(listTableTrClass, "cursor-pointer")}
                      >
                        <td className={listTableTdPrimaryClass}>{row.item_code}</td>
                        <td className={listTableTdClass}>{row.name}</td>
                        <td className={listTableTdClass}>
                          {categoryMap.get(row.category_id) ?? "—"}
                        </td>
                        <td className={listTableTdClass}>
                          {row.subcategory_id != null
                            ? subcategoryNameById.get(row.subcategory_id) ?? "—"
                            : "—"}
                        </td>
                        <td className={cn(listTableTdClass, "max-w-[120px] truncate")} title={gg.group}>
                          {gg.group}
                        </td>
                        <td className={cn(listTableTdClass, "max-w-[120px] truncate")} title={gg.subgroup}>
                          {gg.subgroup}
                        </td>
                        <td className={listTableTdClass}>{unitMap.get(row.unit_id) ?? "—"}</td>
                        <td className={listTableTdClass}>{row.is_active ? "Active" : "Inactive"}</td>
                        <td className={listTableTdClass}>
                          {row.default_warehouse_id != null
                            ? warehouseCodeById.get(row.default_warehouse_id) ?? `#${row.default_warehouse_id}`
                            : "—"}
                        </td>
                        <td className={cn(listTableTdClass, "max-w-[140px] truncate")} title={row.stock_group_id != null ? stockGroupLabelById.get(row.stock_group_id) : ""}>
                          {row.stock_group_id != null ? stockGroupLabelById.get(row.stock_group_id) ?? `#${row.stock_group_id}` : "—"}
                        </td>
                        <td className={cn(listTableTdClass, "text-right")}>{row.default_cost}</td>
                        <td className={cn(listTableTdClass, "text-right")} onClick={(e) => e.stopPropagation()}>
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
                                  onClick={() => { openItemModal(row, "edit"); setOpenItemActionsId(null); }}
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
                    );
                    })}
                  </tbody>
                </table>
              </ResponsiveTableContainer>
              {itemTotal > 0 ? (
                <DataTablePagination
                  page={itemPage}
                  pageSize={pageSize}
                  total={itemTotal}
                  onPageChange={setItemPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setItemPage(1);
                  }}
                />
              ) : null}
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
                {itemModalMode === "view" ? "Item" : "Edit item"}
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
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                        erpControlFocusClass,
                      )}
                      value={editingItem.item_code}
                      readOnly
                      title="Item codes cannot be changed after creation."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                    <input
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                        erpControlFocusClass,
                      )}
                      value={editForm.name}
                      readOnly={itemModalMode === "view"}
                      onChange={(e) => setEditForm((p) => p && { ...p, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">Category</label>
                    <select
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80",
                        erpControlFocusClass,
                      )}
                      value={editForm.category_id}
                      disabled={itemModalMode === "view"}
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
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80",
                        erpControlFocusClass,
                      )}
                      value={editForm.subcategory_id ?? ""}
                      disabled={itemModalMode === "view"}
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
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80",
                        erpControlFocusClass,
                      )}
                      value={editForm.unit_id}
                      disabled={itemModalMode === "view"}
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
                      className={cn(
                        "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                        erpControlFocusClass,
                      )}
                      value={editForm.default_cost ?? "0"}
                      readOnly={itemModalMode === "view"}
                      onChange={(e) => setEditForm((p) => p && { ...p, default_cost: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Default warehouse</label>
                  <select
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80",
                      erpControlFocusClass,
                    )}
                    value={editForm.default_warehouse_id ?? ""}
                    disabled={itemModalMode === "view"}
                    onChange={(e) =>
                      setEditForm(
                        (p) =>
                          p && {
                            ...p,
                            default_warehouse_id: e.target.value ? Number(e.target.value) : null,
                          },
                      )
                    }
                  >
                    <option value="">None</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.warehouse_code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Stock group</label>
                  <select
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80",
                      erpControlFocusClass,
                    )}
                    value={editForm.stock_group_id ?? ""}
                    disabled={itemModalMode === "view"}
                    onChange={(e) =>
                      setEditForm(
                        (p) =>
                          p && {
                            ...p,
                            stock_group_id: e.target.value ? Number(e.target.value) : null,
                          },
                      )
                    }
                  >
                    <option value="">None</option>
                    {stockGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.group_code} — {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    className="rounded border-border-strong disabled:opacity-60"
                    checked={editForm.is_active ?? true}
                    disabled={itemModalMode === "view"}
                    onChange={(e) => setEditForm((p) => p && { ...p, is_active: e.target.checked })}
                  />
                  Active
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  {itemModalMode === "view" ? (
                    <>
                      <Button type="button" variant="outline" onClick={closeEdit}>
                        Close
                      </Button>
                      <Button type="button" onClick={() => setItemModalMode("edit")}>
                        Edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={backItemToView}>
                        Cancel
                      </Button>
                      <Button type="submit">Save changes</Button>
                    </>
                  )}
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
                {unitModalMode === "view" ? "Unit" : "Edit unit"}
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
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                      erpControlFocusClass,
                    )}
                    value={editingUnit.unit_code}
                    readOnly
                    title="Unit codes cannot be changed after creation."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle focus:border-brand-primary focus:outline-none focus:ring-0"
                    value={unitEditForm.name}
                    readOnly={unitModalMode === "view"}
                    onChange={(e) => setUnitEditForm((p) => p && { ...p, name: e.target.value })}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  {unitModalMode === "view" ? (
                    <>
                      <Button type="button" variant="outline" onClick={closeUnitEdit}>
                        Close
                      </Button>
                      <Button type="button" onClick={() => setUnitModalMode("edit")}>
                        Edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={backUnitToView}>
                        Cancel
                      </Button>
                      <Button type="submit">Save changes</Button>
                    </>
                  )}
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
                {warehouseModalMode === "view" ? "Warehouse" : "Edit warehouse"}
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
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                      erpControlFocusClass,
                    )}
                    value={warehouseEditForm.warehouse_code}
                    readOnly
                    title="Warehouse codes cannot be changed after creation."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle focus:border-brand-primary focus:outline-none focus:ring-0"
                    value={warehouseEditForm.name}
                    readOnly={warehouseModalMode === "view"}
                    onChange={(e) => setWarehouseEditForm((p) => p && { ...p, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Address (optional)</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle focus:border-brand-primary focus:outline-none focus:ring-0"
                    value={warehouseEditForm.address ?? ""}
                    readOnly={warehouseModalMode === "view"}
                    onChange={(e) =>
                      setWarehouseEditForm((p) => p && { ...p, address: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  {warehouseModalMode === "view" ? (
                    <>
                      <Button type="button" variant="outline" onClick={closeWarehouseEdit}>
                        Close
                      </Button>
                      <Button type="button" onClick={() => setWarehouseModalMode("edit")}>
                        Edit
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={backWarehouseToView}>
                        Cancel
                      </Button>
                      <Button type="submit">Save changes</Button>
                    </>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingCategory && categoryEditForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/50 p-4"
          onClick={closeCategoryModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-category-title"
        >
          <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-category-title" className="text-lg">
                Edit category
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeCategoryModal}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveCategoryEdit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                      erpControlFocusClass,
                    )}
                    value={editingCategory.category_code}
                    readOnly
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm",
                      erpControlFocusClass,
                    )}
                    value={categoryEditForm.name ?? ""}
                    onChange={(e) =>
                      setCategoryEditForm((p) => p && { ...p, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Description</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm",
                      erpControlFocusClass,
                    )}
                    value={categoryEditForm.description ?? ""}
                    onChange={(e) =>
                      setCategoryEditForm((p) => p && { ...p, description: e.target.value || undefined })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    className="rounded border-border-strong"
                    checked={categoryEditForm.is_active ?? true}
                    onChange={(e) =>
                      setCategoryEditForm((p) => p && { ...p, is_active: e.target.checked })
                    }
                  />
                  Active
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeCategoryModal}>
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {editingSubcategory && subcategoryEditForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/50 p-4"
          onClick={closeSubcategoryModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-subcategory-title"
        >
          <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-subcategory-title" className="text-lg">
                Edit subcategory
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeSubcategoryModal}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveSubcategoryEdit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm read-only:bg-surface-subtle",
                      erpControlFocusClass,
                    )}
                    value={editingSubcategory.subcategory_code}
                    readOnly
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Category</label>
                  <select
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm",
                      erpControlFocusClass,
                    )}
                    value={subcategoryEditForm.category_id ?? editingSubcategory.category_id}
                    onChange={(e) =>
                      setSubcategoryEditForm((p) => p && { ...p, category_id: Number(e.target.value) })
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
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm",
                      erpControlFocusClass,
                    )}
                    value={subcategoryEditForm.name ?? ""}
                    onChange={(e) =>
                      setSubcategoryEditForm((p) => p && { ...p, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Description</label>
                  <input
                    className={cn(
                      "w-full rounded-lg border border-border-strong px-3 py-2 text-sm",
                      erpControlFocusClass,
                    )}
                    value={subcategoryEditForm.description ?? ""}
                    onChange={(e) =>
                      setSubcategoryEditForm((p) => p && { ...p, description: e.target.value || undefined })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    className="rounded border-border-strong"
                    checked={subcategoryEditForm.is_active ?? true}
                    onChange={(e) =>
                      setSubcategoryEditForm((p) => p && { ...p, is_active: e.target.checked })
                    }
                  />
                  Active
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeSubcategoryModal}>
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
