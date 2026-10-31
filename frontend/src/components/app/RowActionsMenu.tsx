import { useEffect, useId, useRef, type ReactNode } from "react";

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
};

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
}: RowActionsMenuProps) {
  const open = openId === rowId;
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOpenChange(null);
      }
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

  return (
    <div ref={rootRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(open ? null : rowId)}
        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
      >
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          {items.map((item) => {
            const itemClass = item.danger
              ? "block w-full rounded-md px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              : "block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50";
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
      ) : null}
    </div>
  );
}
