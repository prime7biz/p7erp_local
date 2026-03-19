import { useEffect, useMemo, useRef, useState } from "react";
import type { CostingItemResponse } from "@/api/client";
import { toSafeNumber } from "../mappers/quotationNumeric";

type Props = {
  items: CostingItemResponse[];
  categoryId: number | null;
  itemId: number | null;
  onSelect: (item: CostingItemResponse | null) => void;
  disabled?: boolean;
};

function displayItem(it: CostingItemResponse) {
  return `${it.item_code} · ${it.name}`;
}

export function MaterialItemCombobox({ items, categoryId, itemId, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);

  useEffect(() => {
    if (selected) setQuery(displayItem(selected));
    else if (!open) setQuery("");
  }, [selected, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    let list = categoryId != null ? items.filter((i) => i.category_id === categoryId) : items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) => i.item_code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 60);
  }, [items, categoryId, query]);

  if (disabled) {
    return <span className="text-xs">{selected ? displayItem(selected) : "—"}</span>;
  }

  return (
    <div ref={rootRef} className="relative w-full min-w-[140px]">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (selected && e.target.value !== displayItem(selected)) {
            onSelect(null);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search code or name…"
        className="w-full rounded border border-border px-1.5 py-1 text-xs"
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-0.5 max-h-44 overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg">
          <button
            type="button"
            className="block w-full px-2 py-1.5 text-left text-[11px] text-text-muted hover:bg-surface-subtle"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelect(null);
              setQuery("");
              setOpen(false);
            }}
          >
            Clear selection
          </button>
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-text-muted">No matches</div>
          ) : (
            filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                className="block w-full px-2 py-1.5 text-left text-[11px] text-text-secondary hover:bg-surface-subtle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(it);
                  setQuery(displayItem(it));
                  setOpen(false);
                }}
              >
                {displayItem(it)}
              </button>
            ))
          )}
        </div>
      )}
      {selected?.default_cost != null && toSafeNumber(selected.default_cost) > 0 && (
        <p className="mt-0.5 text-[10px] text-text-muted">Ref cost: {selected.default_cost}</p>
      )}
    </div>
  );
}
