import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Size = "md" | "lg" | "xl";

const sizeClass: Record<Size, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

type CommonProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  error?: string;
  children: ReactNode;
  size?: Size;
  labels?: { cancel?: string; saving?: string; close?: string };
};

type FormModeProps = CommonProps & {
  mode?: "form";
  onSubmit: (e: FormEvent) => void;
  submitLabel?: string;
  submitting?: boolean;
  footer?: never;
};

type PanelModeProps = CommonProps & {
  /** Detail / read-write panel without a wrapping submit form (e.g. vendor bill Post AP). */
  mode: "panel";
  onSubmit?: never;
  submitLabel?: never;
  submitting?: never;
  footer?: ReactNode;
};

export type FinanceFormDrawerProps = FormModeProps | PanelModeProps;

/**
 * Wide slide-over for finance create/edit forms. Matches voucher-entry polish:
 * sectioned body, sticky footer, Escape / backdrop close. Does not edit HrFormDrawer.
 */
export function FinanceFormDrawer(props: FinanceFormDrawerProps) {
  const {
    open,
    title,
    description,
    onClose,
    error,
    children,
    size = "lg",
    labels,
  } = props;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const firstField = bodyRef.current?.querySelector<HTMLElement>("input, select, textarea");
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

  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-raised px-5 py-4">
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onCloseRef.current()}
        aria-label={labels?.close ?? "Close form"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const body = (
    <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-subtle/40 px-5 py-4">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground"
        >
          {error}
        </div>
      ) : null}
      {children}
    </div>
  );

  const formFooter =
    props.mode !== "panel" ? (
      <div className="flex justify-end gap-2 border-t border-border bg-surface-raised px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
        >
          {labels?.cancel ?? "Cancel"}
        </button>
        <button
          type="submit"
          disabled={props.submitting}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {props.submitting ? (labels?.saving ?? "Saving…") : (props.submitLabel ?? "Save")}
        </button>
      </div>
    ) : props.footer != null ? (
      <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-raised px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        {props.footer}
      </div>
    ) : null;

  const shell = (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button
        type="button"
        aria-label={labels?.close ?? "Close"}
        tabIndex={-1}
        className="absolute inset-0 bg-black/30"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`relative flex h-full w-full flex-col bg-surface-raised shadow-2xl outline-none ${sizeClass[size]}`}
      >
        {props.mode === "panel" ? (
          <>
            {header}
            {body}
            {formFooter}
          </>
        ) : (
          <form onSubmit={props.onSubmit} className="flex h-full flex-col">
            {header}
            {body}
            {formFooter}
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
