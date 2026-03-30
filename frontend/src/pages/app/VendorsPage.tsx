import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useListPagination } from "@/hooks/useListPagination";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  VendorKpiCards,
  VendorFilterBar,
  VendorTable,
  VendorCards,
  VendorDetailDrawer,
} from "@/pages/app/components/vendors";
import {
  listPageErrorClass,
  listPagePanelClass,
  listPageRootClass,
  listPageTableCardClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";

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
  const { pageSize, setPageSize } = useListPagination();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, activeOnly, vendorType, currency, hasLedger, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listVendorsPaginated({
        search: search.trim() || undefined,
        is_active: activeOnly,
        vendor_type: vendorType || undefined,
        currency: currency || undefined,
        has_ledger: hasLedger,
        page,
        page_size: pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [search, activeOnly, vendorType, currency, hasLedger, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!drawerOpen || !selectedVendor) return;
    const updated = items.find((v) => v.id === selectedVendor.id);
    if (updated && updated !== selectedVendor) setSelectedVendor(updated);
  }, [items, drawerOpen, selectedVendor]);

  const kpis = useMemo(() => {
    const active = items.filter((v) => v.is_active).length;
    const inactive = items.length - active;
    const ledgerLinked = items.filter((v) => v.ledger_id != null).length;
    const foreignCurrency = items.filter((v) => {
      const cur = (v.default_currency || "").toUpperCase();
      return cur !== "" && cur !== "BDT";
    }).length;
    return { total, active, inactive, ledgerLinked, foreignCurrency };
  }, [items, total]);

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
    const created = await api.createVendor(data);
    await load();
    return created.id;
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
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Vendors"
        description="Sourcing / procurement · Supplier master. Link purchase orders and receiving to these vendors for consistent operational data."
        actions={
          <Link
            to="/app/purchase-orders"
            className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
          >
            Purchase orders
          </Link>
        }
      />

      {error && (
        <div className={cn(listPageErrorClass, "flex items-center justify-between")}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-status-danger-foreground hover:opacity-90">
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-2">
        <VendorKpiCards
          total={kpis.total}
          active={kpis.active}
          inactive={kpis.inactive}
          ledgerLinked={kpis.ledgerLinked}
          foreignCurrency={kpis.foreignCurrency}
        />
        {totalPages > 1 ? (
          <p className="text-xs text-text-muted">
            Active, inactive, ledger, and currency figures above reflect vendors on the current page only. Total is for all
            matching vendors.
          </p>
        ) : null}
      </div>

      <div className={listPagePanelClass}>
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

      <div className={listPageTableCardClass}>
        {loading ? (
          <div className="px-4 py-12 text-center text-text-muted text-sm">Loading vendors…</div>
        ) : viewMode === "table" ? (
          <VendorTable items={items} onRowClick={handleVendorClick} />
        ) : (
          <VendorCards items={items} onCardClick={handleVendorClick} />
        )}
        {!loading && total > 0 ? (
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        ) : null}
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
