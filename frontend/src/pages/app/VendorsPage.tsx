import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
} from "@/api/client";

const PAGE_SIZE = 50;
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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, activeOnly, vendorType, currency, hasLedger]);

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
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [search, activeOnly, vendorType, currency, hasLedger, page]);

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

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [page, totalPages]);

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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Vendors</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Manage supplier/vendor master. Use vendors when creating purchase orders for a consistent supplier list.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-status-danger-foreground hover:text-status-danger-foreground">
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

      <div className="rounded-xl border border-border bg-surface-raised p-3">
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

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden shadow-sm">
        {loading ? (
          <div className="px-4 py-12 text-center text-text-muted text-sm">Loading vendors…</div>
        ) : viewMode === "table" ? (
          <VendorTable items={items} onRowClick={handleVendorClick} />
        ) : (
          <VendorCards items={items} onCardClick={handleVendorClick} />
        )}
        {!loading && total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}{" "}
              vendors
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              {visiblePageNumbers.map((pageNo) => (
                <button
                  key={pageNo}
                  type="button"
                  onClick={() => setPage(pageNo)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    pageNo === page
                      ? "bg-brand-primary text-brand-primary-foreground"
                      : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
                  }`}
                >
                  {pageNo}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
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
