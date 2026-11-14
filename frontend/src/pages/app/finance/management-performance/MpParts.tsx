/** Small shared pieces of the Management Performance page: chips, cards, one Actions menu per row, a dialog. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { statusTone, TONE_CLASS } from "./mgmtPerformanceLogic";

export const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
export const thR = `${th} text-right`;
export const td = "px-3 py-2";
export const tdR = "px-3 py-2 text-right tabular-nums";
export const tableWrap = "overflow-x-auto rounded-xl border border-border bg-surface-raised";
export const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";
export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function Chip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[statusTone(status)]}`} data-status={status}>
      {label ?? status}
    </span>
  );
}

/** "Estimate - not posted" / "Actual - posted" / "Forecast" label next to a figure. */
export function ClassChip({ kind }: { kind: "ACTUAL" | "ESTIMATED" | "FORECAST" }) {
  const text = kind === "ACTUAL" ? "Actual - posted" : kind === "ESTIMATED" ? "Estimate - not posted" : "Forecast - not posted";
  const cls = kind === "ACTUAL" ? TONE_CLASS.ok : TONE_CLASS.neutral;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>;
}

export function KpiCard({ title, value, sub, chip, tone }: { title: string; value: string; sub?: ReactNode; chip?: ReactNode; tone?: "danger" | "ok" }) {
  const valueClass = tone === "danger" ? "text-status-danger-foreground" : tone === "ok" ? "text-status-success-foreground" : "text-text-primary";
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4" data-testid="kpi-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
        {chip}
      </div>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {sub ? <div className="mt-1 text-xs text-text-muted">{sub}</div> : null}
    </div>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

/** One combined "Actions" dropdown per row (.cursor/rules/action-buttons.mdc). */
export function ActionsMenu({ items, onPick, label = "Actions" }: { items: MenuItem[]; onPick: (id: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (items.length === 0) return <span className="text-xs text-text-muted">—</span>;
  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${it.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`}
              onClick={() => {
                setOpen(false);
                onPick(it.id);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-raised p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <div className="mt-3 space-y-3 text-sm">{children}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-text-muted">
      {label}
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-0.5 block text-[11px] font-normal">{hint}</span> : null}
    </label>
  );
}

export function ReasonList({ codes, text }: { codes: string[]; text: (c: string) => string }) {
  if (codes.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-xs text-status-warning-foreground" aria-label="Data gaps">
      {codes.map((c) => (
        <li key={c}>{text(c)}</li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-muted">{children}</p>;
}
