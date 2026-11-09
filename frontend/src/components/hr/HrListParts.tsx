/**
 * Shared building blocks for HR list and dashboard pages
 * (stat card, row Actions menu, sortable column header, active badge).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { listPageKpiCardClass, listPageKpiLabelClass, listTableThClass } from "@/components/app/listPageLayout";

const badgeBaseClass = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className={`${badgeBaseClass} bg-status-success-subtle text-status-success-foreground`}>Active</span>
  ) : (
    <span className={`${badgeBaseClass} bg-surface-subtle text-text-muted`}>Inactive</span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  hint?: string;
  onClick?: () => void;
  /** Set only for filter cards; navigation cards leave it out so they are not announced as toggles. */
  active?: boolean;
}) {
  const content = (
    <>
      <p className={listPageKpiLabelClass}>{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </>
  );
  if (!onClick) return <div className={listPageKpiCardClass}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${listPageKpiCardClass} text-left transition hover:border-brand-primary/60 ${active ? "border-brand-primary ring-1 ring-brand-primary/40" : ""}`}
    >
      {content}
    </button>
  );
}

/** Column header that sorts the list when clicked. */
export function SortableTh<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: K;
  sortKey: K;
  sortDir: "asc" | "desc";
  onSort: (k: K) => void;
}) {
  const active = sortKey === column;
  return (
    <th className={listTableThClass} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(column)} className="inline-flex items-center gap-1 uppercase hover:text-text-primary">
        {label}
        <span className={active ? "text-brand-primary" : "text-text-muted/50"}>{active && sortDir === "desc" ? "▼" : "▲"}</span>
      </button>
    </th>
  );
}

export interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

const MENU_GAP = 4;
const MENU_ESTIMATED_HEIGHT = 160;

/**
 * Single combined "Actions" dropdown (see .cursor/rules/action-buttons.mdc).
 * The menu floats in a portal with fixed position so scrolling tables cannot clip it.
 */
export function RowActionsMenu({
  open,
  onToggle,
  onClose,
  actions,
  disabled = false,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  actions: RowAction[];
  disabled?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  // The menu lives at the end of <body>, so move keyboard focus into it.
  useEffect(() => {
    if (position) menuRef.current?.querySelector("button")?.focus();
  }, [position]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    const openUp = rect.bottom + MENU_GAP + MENU_ESTIMATED_HEIGHT > window.innerHeight && rect.top > MENU_ESTIMATED_HEIGHT;
    setPosition(openUp ? { right, bottom: window.innerHeight - rect.top + MENU_GAP } : { right, top: rect.bottom + MENU_GAP });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  return (
    <div className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
      >
        Actions
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
            style={position}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
                buttonRef.current?.focus();
              }
            }}
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${
                  a.danger ? "text-status-danger hover:bg-status-danger-subtle" : "text-text-secondary hover:bg-surface-subtle"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

