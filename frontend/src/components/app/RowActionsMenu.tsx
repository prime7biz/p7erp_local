import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type RowActionItem = {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  /** Destructive styling (Delete) */
  danger?: boolean;
  disabled?: boolean;
};

type RowActionsMenuProps = {
  rowId: string | number;
  openId: string | number | null;
  onOpenChange: (id: string | number | null) => void;
  items: RowActionItem[];
  /** Optional custom trigger label */
  label?: string;
  className?: string;
  /** Rendered after built-in items (e.g. custom buttons already built) */
  children?: ReactNode;
  /**
   * Float the menu on top of the page (fixed position on <body>) so tables with
   * `overflow-x-auto` cannot cut it off. It opens upward when there is no room below.
   */
  menuPortal?: boolean;
};

const MENU_WIDTH = 160;
const VIEWPORT_GAP = 8;
const OPEN_UP_THRESHOLD = 220;

/** Phones and tablets: tables scroll sideways there, which would cut off an inline menu. */
function isNarrowViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 1023px)").matches
    : false;
}

/**
 * Shared row Actions dropdown (Quotations / Customers pattern).
 * Single combined control — do not use side-by-side Edit/Delete icons.
 */
export function RowActionsMenu({
  rowId,
  openId,
  onOpenChange,
  items,
  label = "Actions",
  className = "",
  children,
  menuPortal: menuPortalProp = false,
}: RowActionsMenuProps) {
  const open = openId === rowId;
  const [narrow] = useState(isNarrowViewport);
  const menuPortal = menuPortalProp || narrow;
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const updatePortalPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(VIEWPORT_GAP, Math.min(r.right - MENU_WIDTH, vw - MENU_WIDTH - VIEWPORT_GAP));
    const spaceBelow = vh - r.bottom - VIEWPORT_GAP;
    const spaceAbove = r.top - VIEWPORT_GAP;
    const openUp = spaceBelow < OPEN_UP_THRESHOLD && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow);
    setPortalStyle(
      openUp
        ? { position: "fixed", left, width: MENU_WIDTH, bottom: vh - r.top + 4, maxHeight, overflowY: "auto" }
        : { position: "fixed", left, width: MENU_WIDTH, top: r.bottom + 4, maxHeight, overflowY: "auto" },
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

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      style={menuPortal ? portalStyle ?? { position: "fixed", visibility: "hidden" } : undefined}
      className={
        menuPortal
          ? "z-[120] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
          : "absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
      }
    >
      {items.map((item) => {
        const itemClass = item.danger
          ? "block w-full rounded-md px-2 py-2.5 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50 lg:py-1.5"
          : "block w-full rounded-md px-2 py-2.5 text-left text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50 lg:py-1.5";
        if (item.href) {
          return (
            <a
              key={item.key}
              role="menuitem"
              href={item.href}
              className={itemClass}
              onClick={() => onOpenChange(null)}
            >
              {item.label}
            </a>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={itemClass}
            onClick={() => {
              onOpenChange(null);
              item.onClick?.();
            }}
          >
            {item.label}
          </button>
        );
      })}
      {children}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`relative inline-block text-left ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(open ? null : rowId)}
        className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle lg:py-1"
      >
        {label}
      </button>
      {menuPortal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
