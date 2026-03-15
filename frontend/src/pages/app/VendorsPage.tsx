import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
} from "@/api/client";
import {
  VendorKpiCards,
  VendorFilterBar,
  VendorTable,
  VendorCards,
  VendorDetailDrawer,
} from "@/pages/app/components/vendors";

type ViewMode = "table" | "cards";

export function VendorsPage() {
  const [items, setItems] = useState<VendorResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState<boolean | undefined>(undefined);
  const [vendorType, setVendorType] = useState("");
  const [currency, setCurrency] = useState("");
  const [hasLedger, setHasLedger] = useState<boolean | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"view" | "create">("view");
  const [selectedVendor, setSelectedVendor] = useState<VendorResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.listVendors({
        search: search.trim() || undefined,
        is_active: activeOnly,
        vendor_type: vendorType || undefined,
        currency: currency || undefined,
        has_ledger: hasLedger,
      });
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [search, activeOnly, vendorType, currency, hasLedger]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const total = items.length;
    const active = items.filter((v) => v.is_active).length;
    const inactive = total - active;
    const ledgerLinked = items.filter((v) => v.ledger_id != null).length;
    const foreignCurrency = items.filter((v) => {
      const cur = (v.default_currency || "").toUpperCase();
      return cur !== "" && cur !== "BDT";
    }).length;
    return { total, active, inactive, ledgerLinked, foreignCurrency };
  }, [items]);

  const handleAddVendor = () => {
    setDrawerMode("create");
    setSelectedVendor(null);
    setDrawerOpen(true);
  };

  const handleVendorClick = (v: VendorResponse) => {
    setDrawerMode("view");
    setSelectedVendor(v);
    setDrawerOpen(true);
  };

  const handleCreate = async (data: VendorCreate) => {
    await api.createVendor(data);
    await load();
  };

  const handleUpdate = async (id: number, data: VendorUpdate) => {
    await api.updateVendor(id, data);
    await load();
  };

  const handleDelete = async (id: number) => {
    await api.deleteVendor(id);
    await load();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage supplier/vendor master. Use vendors when creating purchase orders for a consistent supplier list.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      <VendorKpiCards
        total={kpis.total}
        active={kpis.active}
        inactive={kpis.inactive}
        ledgerLinked={kpis.ledgerLinked}
        foreignCurrency={kpis.foreignCurrency}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <VendorFilterBar
          search={search}
          onSearchChange={setSearch}
          activeOnly={activeOnly}
          onActiveOnlyChange={setActiveOnly}
          vendorType={vendorType}
          onVendorTypeChange={setVendorType}
          currency={currency}
          onCurrencyChange={setCurrency}
          hasLedger={hasLedger}
          onHasLedgerChange={setHasLedger}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAddClick={handleAddVendor}
          onRefresh={load}
          loading={loading}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">Loading vendors…</div>
        ) : viewMode === "table" ? (
          <VendorTable items={items} onRowClick={handleVendorClick} />
        ) : (
          <VendorCards items={items} onCardClick={handleVendorClick} />
        )}
      </div>

      <VendorDetailDrawer
        open={drawerOpen}
        mode={drawerMode}
        vendor={selectedVendor}
        onClose={() => setDrawerOpen(false)}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onSuccess={load}
      />
    </div>
  );
}
