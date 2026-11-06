import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Star,
  Truck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, type GlobalSearchResponse } from "@/api/client";
import { useDebouncedValue, useLatestRequest } from "@/hooks/useDebouncedValue";
import type { CreateAction } from "@/components/shell/createActions";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";
import { isNavFavorite, toggleNavFavorite } from "@/components/shell/navShortcuts";
import { logApiError } from "@/utils/logApiError";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  routes: FlatNavRoute[];
  /** Same role-aware list as the top-bar New menu. */
  createActions: CreateAction[];
  userId: number;
};

type Entry = {
  key: string;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  group: "Create" | "Pages" | "Records";
  route?: FlatNavRoute;
};

const RECORD_ICONS: Record<string, LucideIcon> = {
  customer: Users,
  order: ShoppingCart,
  purchase_order: Truck,
  voucher: Receipt,
  item: Boxes,
  vendor: Truck,
  employee: User,
};

export function CommandPalette({ open, onClose, routes, createActions, userId }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [favTick, setFavTick] = useState(0);
  const [records, setRecords] = useState<GlobalSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const debounced = useDebouncedValue(query.trim(), 250);
  const latest = useLatestRequest();

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setRecords(null);
      setSearching(false);
      return;
    }
    const token = latest.begin();
    setSearching(true);
    api
      .globalSearch(debounced)
      .then((res) => {
        if (latest.isCurrent(token)) setRecords(res);
      })
      .catch((e) => {
        if (latest.isCurrent(token)) setRecords(null);
        logApiError("CommandPalette.globalSearch", e);
      })
      .finally(() => {
        if (latest.isCurrent(token)) setSearching(false);
      });
  }, [debounced, open, latest]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const create: Entry[] = createActions
      .filter((a) => !q || a.label.toLowerCase().includes(q) || (a.keywords ?? "").includes(q))
      .slice(0, q ? 4 : 3)
      .map((a) => ({ key: `create:${a.href}`, label: a.label, sub: "Create", href: a.href, icon: a.icon ?? Plus, group: "Create" }));
    const pages: Entry[] = (q
      ? routes.filter(
          (r) => r.label.toLowerCase().includes(q) || r.section.toLowerCase().includes(q) || r.href.toLowerCase().includes(q),
        )
      : routes
    )
      .slice(0, q ? 8 : 30)
      .map((r) => ({ key: `page:${r.href}`, label: r.label, sub: r.section, href: r.href, icon: r.icon, group: "Pages", route: r }));
    const recs: Entry[] = (records?.groups ?? []).flatMap((g) =>
      g.hits.map((h) => ({
        key: `rec:${h.kind}:${h.id}`,
        label: h.title,
        sub: [g.label, h.subtitle].filter(Boolean).join(" · "),
        href: h.href,
        icon: RECORD_ICONS[h.kind] ?? FileText,
        group: "Records" as const,
      })),
    );
    return [...create, ...pages, ...recs];
  }, [query, routes, records, createActions]);

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
    (entry: Entry) => {
      navigate(entry.href);
      onClose();
    },
    [navigate, onClose],
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
        setActiveIndex((i) => Math.min(i + 1, Math.max(entries.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && entries[activeIndex]) {
        e.preventDefault();
        go(entries[activeIndex]);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, entries, activeIndex, go, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="absolute inset-0 bg-surface-inverse/40" aria-label="Close search" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          {searching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" aria-label="Searching" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, customers, orders, POs, vouchers…"
            aria-label="Search pages and records"
            className="h-11 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[min(55vh,420px)] overflow-y-auto py-1" role="listbox">
          {entries.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">
              {searching ? "Searching…" : "No results"}
            </li>
          ) : (
            entries.map((entry, idx) => {
              const Icon = entry.icon;
              const active = idx === activeIndex;
              const showHeader = idx === 0 || entries[idx - 1]?.group !== entry.group;
              const favorited = entry.route ? isNavFavorite(userId, entry.route.href) : false;
              void favTick;
              return (
                <li key={entry.key} role="option" aria-selected={active}>
                  {showHeader ? (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{entry.group}</div>
                  ) : null}
                  <div
                    className={`mx-1 flex items-center gap-1 rounded-md px-1 ${
                      active ? "border border-brand-primary/20 bg-brand-primary/15" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => go(entry)}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">{entry.label}</span>
                        <span className="block truncate text-[11px] text-text-muted">{entry.sub}</span>
                      </span>
                    </button>
                    {entry.route ? (
                      <button
                        type="button"
                        title={favorited ? "Remove favorite" : "Add favorite"}
                        className="mr-1 rounded-md p-1.5 text-text-muted hover:bg-surface-subtle hover:text-brand-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNavFavorite(userId, {
                            href: entry.route!.href,
                            label: entry.route!.label,
                            section: entry.route!.section,
                          });
                          setFavTick((n) => n + 1);
                        }}
                      >
                        <Star className={`h-3.5 w-3.5 ${favorited ? "fill-brand-primary text-brand-primary" : ""}`} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">
          ↑↓ navigate · Enter open · Star favorite · type 2+ letters to search records
        </div>
      </div>
    </div>
  );
}
