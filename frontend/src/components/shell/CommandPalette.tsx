import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";
import {
  isNavFavorite,
  toggleNavFavorite,
  type NavShortcut,
} from "@/components/shell/navShortcuts";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  routes: FlatNavRoute[];
  userId: number;
  onNavigate?: (entry: NavShortcut) => void;
};

export function CommandPalette({ open, onClose, routes, userId, onNavigate }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [favTick, setFavTick] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes.slice(0, 40);
    return routes
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.section.toLowerCase().includes(q) ||
          r.href.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [query, routes]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = useCallback(
    (route: FlatNavRoute) => {
      const entry = { href: route.href, label: route.label, section: route.section };
      onNavigate?.(entry);
      navigate(route.href);
      onClose();
    },
    [navigate, onClose, onNavigate],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        go(filtered[activeIndex]);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, go, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="absolute inset-0 bg-surface-inverse/40" aria-label="Close search" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules and pages…"
            aria-label="Search modules and pages"
            className="h-11 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[min(50vh,360px)] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">No results</li>
          ) : (
            filtered.map((route, idx) => {
              const Icon = route.icon;
              const active = idx === activeIndex;
              const favorited = isNavFavorite(userId, route.href);
              void favTick;
              return (
                <li key={route.href} role="option" aria-selected={active}>
                  <div
                    className={`flex items-center gap-1 px-1 rounded-md mx-1 ${
                      active ? "bg-brand-primary/15 border border-brand-primary/20" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(route)}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">{route.label}</span>
                        <span className="block truncate text-[11px] text-text-muted">{route.section}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      title={favorited ? "Remove favorite" : "Add favorite"}
                      className="mr-1 rounded-md p-1.5 text-text-muted hover:bg-surface-subtle hover:text-brand-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNavFavorite(userId, {
                          href: route.href,
                          label: route.label,
                          section: route.section,
                        });
                        setFavTick((n) => n + 1);
                      }}
                    >
                      <Star className={`h-3.5 w-3.5 ${favorited ? "fill-brand-primary text-brand-primary" : ""}`} />
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">
          ↑↓ navigate · Enter open · Star favorite
        </div>
      </div>
    </div>
  );
}
