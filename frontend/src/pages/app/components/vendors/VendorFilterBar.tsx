import { List, LayoutGrid } from "lucide-react";

type ViewMode = "table" | "cards";

interface VendorFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  activeOnly: boolean | undefined;
  onActiveOnlyChange: (v: boolean | undefined) => void;
  vendorType: string;
  onVendorTypeChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  hasLedger: boolean | undefined;
  onHasLedgerChange: (v: boolean | undefined) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  onAddClick: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function VendorFilterBar({
  search,
  onSearchChange,
  activeOnly,
  onActiveOnlyChange,
  vendorType,
  onVendorTypeChange,
  currency,
  onCurrencyChange,
  hasLedger,
  onHasLedgerChange,
  viewMode,
  onViewModeChange,
  onAddClick,
  onRefresh,
  loading = false,
}: VendorFilterBarProps) {
  const hasFilters =
    search.trim() !== "" ||
    activeOnly !== undefined ||
    vendorType !== "" ||
    currency.trim() !== "" ||
    hasLedger !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Search by code or name..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-48 min-w-[140px] rounded-lg border border-border px-3 py-1.5 text-sm placeholder:text-text-muted"
      />
      <select
        value={activeOnly === true ? "active" : activeOnly === false ? "inactive" : ""}
        onChange={(e) => {
          const v = e.target.value;
          onActiveOnlyChange(v === "active" ? true : v === "inactive" ? false : undefined);
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        <option value="">All status</option>
        <option value="active">Active only</option>
        <option value="inactive">Inactive only</option>
      </select>
      <select
        value={vendorType}
        onChange={(e) => onVendorTypeChange(e.target.value)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        <option value="">All vendor types</option>
        <option value="local">Local</option>
        <option value="foreign">Foreign</option>
      </select>
      <input
        type="text"
        placeholder="Currency (USD, CNY...)"
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value.toUpperCase())}
        className="w-44 min-w-[120px] rounded-lg border border-border px-3 py-1.5 text-sm placeholder:text-text-muted"
      />
      <select
        value={hasLedger === true ? "yes" : hasLedger === false ? "no" : ""}
        onChange={(e) => {
          const v = e.target.value;
          onHasLedgerChange(v === "yes" ? true : v === "no" ? false : undefined);
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        <option value="">All ledger</option>
        <option value="yes">Ledger linked</option>
        <option value="no">No ledger</option>
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            onSearchChange("");
            onActiveOnlyChange(undefined);
            onVendorTypeChange("");
            onCurrencyChange("");
            onHasLedgerChange(undefined);
          }}
          className="text-sm text-primary hover:underline"
        >
          Clear filters
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            className={`rounded-md p-1.5 ${viewMode === "table" ? "bg-surface-subtle text-text-primary" : "text-text-muted hover:bg-surface-subtle"}`}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("cards")}
            className={`rounded-md p-1.5 ${viewMode === "cards" ? "bg-surface-subtle text-text-primary" : "text-text-muted hover:bg-surface-subtle"}`}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
        >
          Add vendor
        </button>
      </div>
    </div>
  );
}
