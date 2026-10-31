import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ClipboardList, FileText, Package, Plus, Truck, X } from "lucide-react";

const QUICK_CREATE_LINKS = [
  { label: "New order", href: "/app/orders/new", icon: ClipboardList },
  { label: "New PO", href: "/app/inventory/purchase-orders", icon: Package },
  { label: "New challan", href: "/app/inventory/delivery-challans/new", icon: Truck },
  { label: "New voucher", href: "/app/accounts/vouchers", icon: FileText },
] as const;

/**
 * Mobile-only quick-create FAB for authenticated /app/* routes.
 * Sits above the bottom nav; desktop uses the top-bar New menu instead.
 */
export function QuickCreateFab() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isAppRoute = /(^|\/)app(\/|$)/.test(location.pathname);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!isAppRoute) return null;

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[45] flex flex-col items-end gap-2 lg:hidden"
    >
      {open ? (
        <div
          className="mb-1 w-48 overflow-hidden rounded-xl border border-white/20 bg-white/90 shadow-lg backdrop-blur-sm dark:border-border dark:bg-surface-raised/95"
          role="menu"
          aria-label="Quick create menu"
        >
          {QUICK_CREATE_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-state-hover hover:text-text-primary"
              >
                <Icon className="h-4 w-4 text-text-muted" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-press flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-brand-primary-foreground shadow-lg ring-1 ring-brand-primary/25 hover:bg-brand-hover active:bg-brand-pressed"
        aria-expanded={open}
        aria-label={open ? "Close quick create menu" : "Quick create menu"}
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
