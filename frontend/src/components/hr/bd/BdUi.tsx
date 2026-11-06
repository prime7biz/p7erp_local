/**
 * Small shared building blocks for the Bangladesh HR screens (same look as the other HR pages).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export const inputCls = "w-full rounded border border-border-strong px-3 py-2 text-sm";
export const btnPrimary =
  "rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary = "rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50";

export function Card({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {description ? <p className="mt-0.5 max-w-3xl text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Banner({ kind, children }: { kind: "error" | "success" | "warning" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-status-danger/20 bg-status-danger-subtle text-status-danger-foreground",
    success: "border-status-success/20 bg-status-success-subtle text-status-success-foreground",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-border bg-surface-subtle text-text-secondary",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "gray" | "blue"; children: ReactNode }) {
  const cls = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function SimpleTable<T>({ rows, columns, empty, rowKey }: { rows: T[]; columns: Column<T>[]; empty: string; rowKey: (row: T, i: number) => string | number }) {
  if (!rows.length) return <div className="rounded-lg border border-border p-6 text-center text-sm text-text-muted">{empty}</div>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`px-3 py-2 text-xs font-medium uppercase text-text-muted ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map((c) => (
                <td key={c.header} className={`px-3 py-2 align-top text-text-secondary ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** One combined "Actions" dropdown per row (project convention). */
export function ActionsMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        Actions
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {visible.map((i) => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${i.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Messages({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice && !error ? <Banner kind="success">{notice}</Banner> : null}
    </>
  );
}
