import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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
  /**
   * Tally-style "create on the fly": shows a "+ Create" row and binds Alt+C while focused.
   * Receives the text the user typed so the create form can prefill the name.
   */
  onCreateNew?: (typedText: string) => void;
  /** Noun used in the create row, e.g. "ledger" -> "+ New ledger". */
  createLabel?: string;
  /**
   * Float the menu on top of the page (fixed position on <body>) so tables and scroll boxes
   * cannot cut it off. It opens upward when there is no room below.
   */
  menuPortal?: boolean;
};

const PORTAL_MENU_MAX_HEIGHT = 320;
const PORTAL_MENU_MIN_WIDTH = 320;
const VIEWPORT_GAP = 8;

/**
 * Server-driven combobox: debounced search, paged results, optional hydrate-by-id for forms.
 * Keeps a familiar text field + dropdown pattern used across ERP screens.
 * Keyboard: Arrow Up/Down to highlight, Enter to pick the highlighted row, Escape to close.
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
  onCreateNew,
  createLabel = "record",
  menuPortal = false,
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
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
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [options, open]);

  const updatePortalPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const r = input.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, PORTAL_MENU_MIN_WIDTH), vw - VIEWPORT_GAP * 2);
    const left = Math.max(VIEWPORT_GAP, Math.min(r.left, vw - width - VIEWPORT_GAP));
    const spaceBelow = vh - r.bottom - VIEWPORT_GAP;
    const spaceAbove = r.top - VIEWPORT_GAP;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(PORTAL_MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    setPortalStyle(
      openUp
        ? { position: "fixed", left, width, bottom: vh - r.top + 2, maxHeight }
        : { position: "fixed", left, width, top: r.bottom + 2, maxHeight },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || !menuPortal) return;
    updatePortalPosition();
    window.addEventListener("scroll", updatePortalPosition, true);
    window.addEventListener("resize", updatePortalPosition);
    return () => {
      window.removeEventListener("scroll", updatePortalPosition, true);
      window.removeEventListener("resize", updatePortalPosition);
    };
  }, [open, menuPortal, updatePortalPosition]);

  useEffect(() => {
    if (activeIndex < 0) return;
    menuRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const inputDisplay = open
    ? searchInput
    : selectedLabel || (numericValue != null ? `#${numericValue}` : "");

  const triggerCreate = () => {
    if (!onCreateNew) return;
    const typed = open ? searchInput.trim() : "";
    setOpen(false);
    onCreateNew(typed);
  };

  const pick = (opt: RemoteSelectOption<T>) => {
    onChange(opt.value, opt);
    setSearchInput(opt.label);
    setOpen(false);
  };

  const showMenu = open && !disabled;
  const menu = showMenu ? (
    <div
      ref={menuRef}
      role="listbox"
      style={menuPortal ? portalStyle ?? { position: "fixed", visibility: "hidden" } : undefined}
      className={
        menuPortal
          ? "z-[1000] overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-xl"
          : "absolute left-0 right-0 z-30 mt-0.5 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg"
      }
    >
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
        options.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={opt.value === numericValue}
            data-option-index={idx}
            className={`block w-full whitespace-normal break-words px-2 py-1.5 text-left text-xs hover:bg-surface-subtle ${
              idx === activeIndex ? "bg-surface-subtle text-text-primary" : "text-text-secondary"
            } ${opt.value === numericValue ? "font-semibold" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => pick(opt)}
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
      {onCreateNew ? (
        <button
          type="button"
          className="block w-full border-t border-border px-2 py-1.5 text-left text-xs font-medium text-brand-primary hover:bg-surface-subtle"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerCreate}
        >
          {searchInput.trim() ? `+ Create ${createLabel} “${searchInput.trim()}”` : `+ New ${createLabel}`}
          <span className="ml-1 text-text-muted">(Alt+C)</span>
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        aria-label={ariaLabel}
        placeholder={placeholder}
        title={onCreateNew ? `Alt+C: create a new ${createLabel}` : undefined}
        className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
        value={inputDisplay}
        onKeyDown={(e) => {
          if (onCreateNew && e.altKey && !e.ctrlKey && !e.metaKey && (e.key.toLowerCase() === "c" || e.code === "KeyC")) {
            e.preventDefault();
            triggerCreate();
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
              setSearchInput("");
              setOpen(true);
              return;
            }
            if (options.length === 0) return;
            setActiveIndex((i) =>
              e.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1),
            );
            return;
          }
          if (e.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
            e.preventDefault();
            pick(options[activeIndex]);
            return;
          }
          if ((e.key === "Escape" || e.key === "Tab") && open) {
            if (e.key === "Escape") e.preventDefault();
            setOpen(false);
          }
        }}
        onChange={(e) => {
          setSearchInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (!open) setSearchInput("");
        }}
      />
      {menuPortal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
