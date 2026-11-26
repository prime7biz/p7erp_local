import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";

export type LocalSelectOption<T = unknown> = {
  value: string | number;
  label: string;
  meta?: T;
};

type Props<T = unknown> = {
  value: string | number | null | "";
  onChange: (next: string | number | "", option?: LocalSelectOption<T>) => void;
  options: LocalSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  emptyMessage?: string;
  allowClear?: boolean;
  /** Override default case-insensitive includes filter on label. */
  filterFn?: (opt: LocalSelectOption<T>, query: string) => boolean;
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
/** Rows drawn at first; more are drawn as the user scrolls (nothing is ever cut off). */
const INITIAL_VISIBLE = 150;
const VISIBLE_STEP = 150;
const SCROLL_LOAD_THRESHOLD_PX = 40;

function valuesEqual(a: string | number | null | "", b: string | number | null | ""): boolean {
  if (a === "" || a == null) return b === "" || b == null;
  if (b === "" || b == null) return false;
  return String(a) === String(b);
}

/** Every typed word must appear somewhere in the label ("senior op" finds "Senior Operator"). */
function defaultFilter<T>(opt: LocalSelectOption<T>, query: string): boolean {
  const label = opt.label.toLowerCase();
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => label.includes(word));
}

/**
 * Client-side combobox: type to narrow a local option list (contains match).
 * Same look and keyboard as RemoteSearchSelect (arrows, Enter, Escape, clear).
 * Example: typing "operator" keeps "Junior Operator" and "Senior Operator".
 */
export function LocalSearchSelect<T = unknown>({
  value,
  onChange,
  options,
  placeholder = "Search…",
  disabled = false,
  required = false,
  className = "",
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  emptyMessage = "No matches",
  allowClear = true,
  filterFn = defaultFilter,
  onCreateNew,
  createLabel = "record",
  menuPortal = false,
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);

  const selected = useMemo(
    () => options.find((o) => valuesEqual(o.value, value)) ?? null,
    [options, value],
  );
  const hasValue = selected != null;

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const matches = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return q ? options.filter((o) => filterFn(o, q)) : options;
  }, [options, searchInput, filterFn]);

  const filtered = useMemo(() => matches.slice(0, visibleCount), [matches, visibleCount]);

  // Start from the top again whenever the search text changes or the menu is reopened.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [searchInput, open]);

  const loadMoreRows = useCallback(() => {
    setVisibleCount((n) => (n < matches.length ? n + VISIBLE_STEP : n));
  }, [matches.length]);

  const onMenuScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_LOAD_THRESHOLD_PX) {
      loadMoreRows();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [searchInput, open]);

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
    const el = menuRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function") {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const inputDisplay = open ? searchInput : selected?.label ?? "";

  const triggerCreate = () => {
    if (!onCreateNew) return;
    const typed = open ? searchInput.trim() : "";
    setOpen(false);
    onCreateNew(typed);
  };

  const pick = (opt: LocalSelectOption<T>) => {
    onChange(opt.value, opt);
    setSearchInput(opt.label);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setSearchInput("");
    setOpen(false);
  };

  const showMenu = open && !disabled;
  const menu = showMenu ? (
    <div
      ref={menuRef}
      role="listbox"
      onScroll={onMenuScroll}
      style={menuPortal ? portalStyle ?? { position: "fixed", visibility: "hidden" } : undefined}
      className={
        menuPortal
          ? "z-[1000] overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-xl"
          : "absolute left-0 right-0 z-30 mt-0.5 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-raised py-0.5 shadow-lg"
      }
    >
      {allowClear && hasValue ? (
        <button
          type="button"
          className="block w-full px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-subtle"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          Clear selection
        </button>
      ) : null}
      {filtered.length === 0 ? (
        <div className="px-2 py-2 text-xs text-text-muted">{emptyMessage}</div>
      ) : (
        filtered.map((opt, idx) => (
          <button
            key={String(opt.value)}
            type="button"
            role="option"
            aria-selected={valuesEqual(opt.value, value)}
            data-option-index={idx}
            className={`block w-full whitespace-normal break-words px-2 py-1.5 text-left text-xs hover:bg-surface-subtle ${
              idx === activeIndex ? "bg-surface-subtle text-text-primary" : "text-text-secondary"
            } ${valuesEqual(opt.value, value) ? "font-semibold" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => pick(opt)}
          >
            {opt.label}
          </button>
        ))
      )}
      {matches.length > filtered.length ? (
        <div className="px-2 py-1.5 text-center text-[11px] text-text-muted" aria-live="polite">
          Showing {filtered.length} of {matches.length} — scroll or type to narrow
        </div>
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
      {/* Hidden input so native form `required` still blocks empty submits. */}
      {required ? (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={hasValue ? String(selected!.value) : ""}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
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
            if (filtered.length === 0) return;
            // Reaching the last drawn row with the keyboard draws the next batch.
            if (e.key === "ArrowDown" && activeIndex + 1 >= filtered.length - 1) loadMoreRows();
            setActiveIndex((i) =>
              e.key === "ArrowDown" ? Math.min(filtered.length - 1, i + 1) : Math.max(0, i - 1),
            );
            return;
          }
          if (e.key === "Enter" && open && activeIndex >= 0 && filtered[activeIndex]) {
            e.preventDefault();
            pick(filtered[activeIndex]);
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
