import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { reasonError } from "./phase2Logic";

export const inputCls = "mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-text-primary";
export const labelCls = "block text-xs font-medium text-text-secondary";
export const primaryBtn =
  "rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90 disabled:opacity-60";
export const secondaryBtn =
  "rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60";
export const dangerBtn = "rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60";

export function ErrorBox({ message, testId }: { message: string | null | undefined; testId?: string }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid={testId} className="rounded border border-status-danger/20 bg-status-danger-subtle p-2 text-xs text-status-danger-foreground">
      {message}
    </div>
  );
}

export function NoticeBox({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "good" }) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "good"
        ? "border-green-200 bg-green-50 text-green-900"
        : "border-blue-200 bg-blue-50 text-blue-950";
  return (
    <div role="status" className={`rounded border p-2 text-xs ${cls}`}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-border p-3 text-center text-xs text-text-muted">{children}</p>;
}

/**
 * Small modal used to confirm a change before it is written. Optional reason box (required when `reasonMin` > 0).
 * Escape or Cancel closes it; the confirm button is disabled while `pending`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  reasonLabel,
  reasonMin = 0,
  reasonPlaceholder,
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Show a reason box with this label. */
  reasonLabel?: string;
  reasonMin?: number;
  reasonPlaceholder?: string;
  pending?: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setReason("");
    setTouched(false);
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>("textarea, input, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const reasonErr = reasonLabel ? reasonError(reason, reasonMin) : "";
  return createPortal(
    <div className="fixed inset-0 z-[115] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md space-y-3 rounded-t-xl bg-surface-raised p-4 shadow-2xl sm:rounded-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        {children ? <div className="space-y-2 text-sm text-text-secondary">{children}</div> : null}
        {reasonLabel ? (
          <div>
            <label htmlFor={reasonId} className={labelCls}>
              {reasonLabel}
              {reasonMin > 0 ? ` (at least ${reasonMin} characters)` : " (optional)"}
            </label>
            <textarea
              id={reasonId}
              rows={3}
              className={inputCls}
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && reasonErr ? <p className="mt-1 text-[11px] text-red-700">{reasonErr}</p> : null}
          </div>
        ) : null}
        <ErrorBox message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={() => onCloseRef.current()}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? dangerBtn : primaryBtn}
            disabled={pending || Boolean(reasonErr)}
            onClick={() => {
              setTouched(true);
              if (reasonErr) return;
              onConfirm(reason.trim());
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required ? " *" : ""}
      </label>
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  hint,
  inputMode,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "number";
  required?: boolean;
  hint?: string;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-0.5 text-[11px] text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul role="alert" className="list-disc space-y-0.5 rounded border border-amber-200 bg-amber-50 p-2 pl-6 text-xs text-amber-950">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
