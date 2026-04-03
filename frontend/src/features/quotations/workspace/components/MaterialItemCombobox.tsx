import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CostingItemResponse } from "@/api/client";
import { toSafeNumber } from "../mappers/quotationNumeric";

type Props = {
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
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);

  const filtered = useMemo(() => {
    let list = categoryId != null ? items.filter((i) => i.category_id === categoryId) : items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) => i.item_code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 60);
  }, [items, categoryId, query]);

  /** Index 0 = clear, 1..n = items, n+1 = create (optional). */
  const optionCount = 1 + filtered.length + (onRequestCreateNew ? 1 : 0);

  useEffect(() => {
    if (selected) setQuery(displayItem(selected));
    else if (!open) setQuery("");
  }, [selected, open]);

  useEffect(() => {
    setHighlight(0);
  }, [open, filtered.length, categoryId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
      onSelect(null);
      setQuery("");
      setOpen(false);
      return;
    }
    const itemIdx = idx - 1;
    if (itemIdx >= 0 && itemIdx < filtered.length) {
      const it = filtered[itemIdx];
      if (it != null) {
        onSelect(it);
        setQuery(displayItem(it));
        setOpen(false);
      }
      return;
    }
    if (onRequestCreateNew && itemIdx === filtered.length) {
      onRequestCreateNew();
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
          setQuery(e.target.value);
          setOpen(true);
          if (selected && e.target.value !== displayItem(selected)) {
            onSelect(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search code or name…"
        className="w-full rounded border border-border px-1.5 py-1 text-xs"
        autoComplete="off"
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-0.5 max-h-44 overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={highlight === 0}
            className={`block w-full px-2 py-1.5 text-left text-[11px] hover:bg-surface-subtle ${
              highlight === 0 ? "bg-surface-subtle text-text-primary" : "text-text-muted"
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(0)}
            onClick={() => chooseIndex(0)}
          >
            Clear selection
          </button>
          {filtered.length === 0 && !onRequestCreateNew ? (
            <div className="px-2 py-2 text-[11px] text-text-muted">No matches</div>
          ) : (
            filtered.map((it, idx) => {
              const i = idx + 1;
              return (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={highlight === i}
                  className={`block w-full px-2 py-1.5 text-left text-[11px] hover:bg-surface-subtle ${
                    highlight === i ? "bg-surface-subtle text-text-primary" : "text-text-secondary"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => chooseIndex(i)}
                >
                  {displayItem(it)}
                </button>
              );
            })
          )}
          {onRequestCreateNew ? (
            <button
              type="button"
              role="option"
              aria-selected={highlight === filtered.length + 1}
              className={`block w-full border-t border-border-subtle px-2 py-1.5 text-left text-[11px] font-medium text-brand-primary hover:bg-surface-subtle ${
                highlight === filtered.length + 1 ? "bg-surface-subtle" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(filtered.length + 1)}
              onClick={() => chooseIndex(filtered.length + 1)}
            >
              + Create new item
            </button>
          ) : null}
        </div>
      )}
      {selected?.default_cost != null && toSafeNumber(selected.default_cost) > 0 && (
        <p className="mt-0.5 text-[10px] text-text-muted">Ref cost: {selected.default_cost}</p>
      )}
    </div>
  );
}
