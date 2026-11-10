import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-over panel for create / edit forms. Escape or the backdrop closes it.
 * The form element wraps body + footer, so Enter submits and the Save button stays visible.
 */
export function HrFormDrawer({
  open,
  title,
  description,
  onClose,
  onSubmit,
  submitLabel = "Save",
  submitting = false,
  error,
  children,
  labels,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel?: string;
  submitting?: boolean;
  error?: string;
  children: ReactNode;
  /** Translated texts (self-service pages have a Bangla switch). */
  labels?: { cancel?: string; saving?: string; close?: string };
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Callers pass inline arrow functions; keep the latest one without re-running the focus effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const firstField = bodyRef.current?.querySelector<HTMLElement>("input, select, textarea");
    // Search pickers open their list on focus and would cover the form; then focus the panel instead.
    if (firstField && firstField.getAttribute("role") !== "combobox") firstField.focus();
    else panelRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  // Keep Tab inside the panel while it is open.
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button type="button" aria-label={labels?.close ?? "Close"} tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="relative flex h-full w-full max-w-lg flex-col bg-surface-raised shadow-2xl outline-none"
      >
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-text-primary">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label={labels?.close ?? "Close form"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? (
              <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
                {error}
              </div>
            ) : null}
            {children}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-raised"
            >
              {labels?.cancel ?? "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? (labels?.saving ?? "Saving…") : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
