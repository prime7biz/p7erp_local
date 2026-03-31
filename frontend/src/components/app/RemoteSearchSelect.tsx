import { useEffect, useRef } from "react";
import {
  useRemotePaginatedSearch,
  type RemoteSelectOption,
} from "@/hooks/useRemotePaginatedSearch";

export type { RemoteSelectOption };

type Props<T = unknown> = {
  value: number | null | "";
  onChange: (next: number | "", option?: RemoteSelectOption<T>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  fetchPage: (
    query: string,
    page: number,
    pageSize: number,
  ) => Promise<{ options: RemoteSelectOption<T>[]; total: number }>;
  hydrateById?: (id: number) => Promise<RemoteSelectOption<T> | null>;
  pageSize?: number;
  debounceMs?: number;
  emptyMessage?: string;
  allowClear?: boolean;
};

/**
 * Server-driven combobox: debounced search, paged results, optional hydrate-by-id for forms.
 * Keeps a familiar text field + dropdown pattern used across ERP screens.
 */
export function RemoteSearchSelect<T = unknown>({
  value,
  onChange,
  placeholder = "Search…",
  disabled = false,
  className = "",
  id,
  "aria-label": ariaLabel,
  fetchPage,
  hydrateById,
  pageSize = 40,
  debounceMs = 300,
  emptyMessage = "No matches",
  allowClear = true,
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    open,
    setOpen,
    searchInput,
    setSearchInput,
    options,
    loading,
    loadingMore,
    error,
    loadMore,
    hasMore,
    selectedLabel,
    numericValue,
  } = useRemotePaginatedSearch<T>({
    valueId: value,
    debounceMs,
    pageSize,
    fetchPage,
    hydrateById,
    enabled: !disabled,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  const inputDisplay = open
    ? searchInput
    : selectedLabel || (numericValue != null ? `#${numericValue}` : "");

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <input
        id={id}
        type="text"
        disabled={disabled}
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
        value={inputDisplay}
        onChange={(e) => {
          setSearchInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (!open) setSearchInput("");
        }}
      />
      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-30 mt-0.5 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg">
          {allowClear && numericValue != null ? (
            <button
              type="button"
              className="block w-full px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-subtle"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setSearchInput("");
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          ) : null}
          {loading ? (
            <div className="px-2 py-2 text-xs text-text-muted">Loading…</div>
          ) : error ? (
            <div className="px-2 py-2 text-xs text-status-danger-foreground">{error}</div>
          ) : options.length === 0 ? (
            <div className="px-2 py-2 text-xs text-text-muted">{emptyMessage}</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="block w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value, opt);
                  setSearchInput(opt.label);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))
          )}
          {hasMore && !loading ? (
            <button
              type="button"
              className="block w-full border-t border-border px-2 py-1.5 text-left text-xs font-medium text-brand-primary hover:bg-surface-subtle disabled:opacity-50"
              disabled={loadingMore}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
