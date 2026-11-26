import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { api, type CostingItemResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { toSafeNumber } from "../mappers/quotationNumeric";

type Props = {
  /** Items already loaded by the page. Used to label saved lines and to show quick results. */
  items: CostingItemResponse[];
  categoryId: number | null;
  itemId: number | null;
  onSelect: (item: CostingItemResponse | null) => void;
  disabled?: boolean;
  onRequestCreateNew?: () => void;
};

function displayItem(it: CostingItemResponse) {
  return `${it.item_code} · ${it.name}`;
}

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 250;
const MENU_MAX_HEIGHT = 240;

/**
 * Material item picker for quotation lines.
 *
 * Every row asks the server for its own matches (search + category + paging), so a long item list
 * works the same on the first row and on every later row.
 */
export function MaterialItemCombobox({
  items,
  categoryId,
  itemId,
  onSelect,
  disabled,
  onRequestCreateNew,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null);
  const [results, setResults] = useState<CostingItemResponse[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hydrated, setHydrated] = useState<CostingItemResponse | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const typingRef = useRef(false);
  const requestSeq = useRef(0);

  const selected = useMemo(() => {
    if (itemId == null) return null;
    return (
      items.find((i) => i.id === itemId) ??
      results.find((i) => i.id === itemId) ??
      (hydrated?.id === itemId ? hydrated : null)
    );
  }, [items, results, hydrated, itemId]);

  // A saved line can point to an item that is not on any loaded page: fetch just that one.
  useEffect(() => {
    if (itemId == null || selected != null) return;
    let cancelled = false;
    api
      .getCostingItem(itemId)
      .then((row) => {
        if (!cancelled) setHydrated(row);
      })
      .catch((err) => logApiError("quotation material item hydrate", err));
    return () => {
      cancelled = true;
    };
  }, [itemId, selected]);

  const searchText = useMemo(() => {
    const q = query.trim();
    if (!q) return "";
    // Opening with a selected item and no typing shows the whole category, not just the one item.
    if (selected && !typingRef.current && q.toLowerCase() === displayItem(selected).toLowerCase()) return "";
    return q;
  }, [query, selected, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setLoadError(false);
      try {
        const page = await api.listCostingItemsPage({
          category_id: categoryId,
          search: searchText,
          limit: PAGE_SIZE,
          offset,
        });
        if (seq !== requestSeq.current) return;
        setResults((prev) => (append ? [...prev, ...page.rows] : page.rows));
        setTotal(page.total);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        logApiError("quotation material items", err);
        setLoadError(true);
        if (!append) setResults([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [categoryId, searchText],
  );

  // Load (debounced) whenever the menu is open and the category or search text changes.
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => void fetchPage(0, false), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [open, fetchPage]);

  useEffect(() => {
    if (selected && !typingRef.current) setQuery(displayItem(selected));
    else if (!open && !selected) setQuery("");
  }, [selected, open]);

  useEffect(() => {
    setHighlight(0);
  }, [open, results.length, categoryId]);

  const updatePortalPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < MENU_MAX_HEIGHT && rect.top > spaceBelow;
    setPortalStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 260),
      zIndex: 80,
      maxHeight: MENU_MAX_HEIGHT,
      ...(flipUp ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePortalPosition();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        const menu = document.getElementById(listboxId);
        if (menu && menu.contains(e.target as Node)) return;
        setOpen(false);
        typingRef.current = false;
      }
    };
    const onScroll = () => updatePortalPosition();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, listboxId, updatePortalPosition]);

  const canLoadMore = total != null && results.length < total;

  /** Index 0 = clear, 1..n = items, then "load more" (optional), then create (optional). */
  const loadMoreIndex = canLoadMore ? 1 + results.length : -1;
  const createIndex = onRequestCreateNew ? 1 + results.length + (canLoadMore ? 1 : 0) : -1;
  const optionCount = 1 + results.length + (canLoadMore ? 1 : 0) + (onRequestCreateNew ? 1 : 0);

  const applyHighlight = (delta: number) => {
    if (optionCount === 0) return;
    setHighlight((h) => {
      const next = h + delta;
      if (next < 0) return optionCount - 1;
      if (next >= optionCount) return 0;
      return next;
    });
  };

  const chooseIndex = (idx: number) => {
    if (idx === 0) {
      typingRef.current = false;
      onSelect(null);
      setQuery("");
      setOpen(false);
      return;
    }
    if (idx === loadMoreIndex) {
      void fetchPage(results.length, true);
      return;
    }
    if (idx === createIndex && onRequestCreateNew) {
      typingRef.current = false;
      onRequestCreateNew();
      setOpen(false);
      return;
    }
    const it = results[idx - 1];
    if (it != null) {
      typingRef.current = false;
      setHydrated(it);
      onSelect(it);
      setQuery(displayItem(it));
      setOpen(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else applyHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else applyHighlight(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      typingRef.current = false;
    } else if (e.key === "Enter") {
      if (open && optionCount > 0) {
        e.preventDefault();
        chooseIndex(highlight);
      }
    }
  };

  if (disabled) {
    return <span className="text-xs">{selected ? displayItem(selected) : "—"}</span>;
  }

  const optionClass = (active: boolean, muted = false) =>
    `block w-full px-2 py-1.5 text-left text-[11px] hover:bg-surface-subtle ${
      active ? "bg-surface-subtle text-text-primary" : muted ? "text-text-muted" : "text-text-secondary"
    }`;

  const menu = open ? (
    <div
      id={listboxId}
      role="listbox"
      style={portalStyle ?? undefined}
      className="overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg"
      onScroll={(e) => {
        // Auto-load the next page when the user scrolls near the bottom.
        const el = e.currentTarget;
        if (canLoadMore && !loading && el.scrollHeight - el.scrollTop - el.clientHeight <= 40) {
          void fetchPage(results.length, true);
        }
      }}
    >
      <button
        type="button"
        role="option"
        aria-selected={highlight === 0}
        className={optionClass(highlight === 0, true)}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHighlight(0)}
        onClick={() => chooseIndex(0)}
      >
        Clear selection
      </button>
      {loading && results.length === 0 ? (
        <div className="px-2 py-2 text-[11px] text-text-muted">Loading items…</div>
      ) : loadError ? (
        <div className="px-2 py-2 text-[11px] text-red-600">Could not load items. Close and open to retry.</div>
      ) : results.length === 0 ? (
        <div className="px-2 py-2 text-[11px] text-text-muted">
          {categoryId != null ? "No items in this category match." : "No matches"}
        </div>
      ) : (
        results.map((it, idx) => (
          <button
            key={it.id}
            type="button"
            role="option"
            aria-selected={highlight === idx + 1}
            className={optionClass(highlight === idx + 1)}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx + 1)}
            onClick={() => chooseIndex(idx + 1)}
          >
            {displayItem(it)}
          </button>
        ))
      )}
      {canLoadMore ? (
        <button
          type="button"
          role="option"
          aria-selected={highlight === loadMoreIndex}
          className={`${optionClass(highlight === loadMoreIndex)} border-t border-border-subtle`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setHighlight(loadMoreIndex)}
          onClick={() => chooseIndex(loadMoreIndex)}
        >
          {loading ? "Loading…" : `Load more (${results.length} of ${total})`}
        </button>
      ) : null}
      {onRequestCreateNew ? (
        <button
          type="button"
          role="option"
          aria-selected={highlight === createIndex}
          className={`block w-full border-t border-border-subtle px-2 py-1.5 text-left text-[11px] font-medium text-brand-primary hover:bg-surface-subtle ${
            highlight === createIndex ? "bg-surface-subtle" : ""
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setHighlight(createIndex)}
          onClick={() => chooseIndex(createIndex)}
        >
          + Create new item
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full min-w-[140px]">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        value={query}
        onChange={(e) => {
          typingRef.current = true;
          setQuery(e.target.value);
          setOpen(true);
          if (selected && e.target.value !== displayItem(selected)) {
            onSelect(null);
          }
        }}
        onFocus={() => {
          typingRef.current = false;
          setOpen(true);
          updatePortalPosition();
        }}
        onKeyDown={onKeyDown}
        placeholder="Search code or name…"
        className="w-full rounded border border-border px-1.5 py-1 text-xs"
        autoComplete="off"
      />
      {menu ? createPortal(menu, document.body) : null}
      {selected?.default_cost != null && toSafeNumber(selected.default_cost) > 0 && (
        <p className="mt-0.5 text-[10px] text-text-muted">Ref cost: {selected.default_cost}</p>
      )}
    </div>
  );
}
