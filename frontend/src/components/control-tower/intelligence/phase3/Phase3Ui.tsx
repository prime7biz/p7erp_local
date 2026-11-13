import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { MoneyValue } from "@/api/mfgCostCash";

import { Chip } from "../IntelligenceUi";
import { isNegativeText, money, MONEY_NOT_POSTED_LABEL, VALUE_CLASS_HELP, valueClassLabel, valueClassTone } from "./phase3Logic";

export function ValueClassChip({ cls }: { cls: string | null | undefined }) {
  if (!cls) return null;
  return (
    <Chip tone={valueClassTone(cls)} title={VALUE_CLASS_HELP[cls.toUpperCase()]}>
      {valueClassLabel(cls)}
    </Chip>
  );
}

/** Amount text in red when negative. */
export function MoneyText({ value, strong = false }: { value: string | null | undefined; strong?: boolean }) {
  const neg = isNegativeText(value);
  return <span className={`${strong ? "font-semibold " : ""}${neg ? "text-red-700" : "text-text-primary"} tabular-nums`}>{money(value)}</span>;
}

/** Amount + its value class under it (table cells). */
export function MoneyCell({ value }: { value: MoneyValue | null | undefined }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <MoneyText value={value?.amount} />
      {value ? <ValueClassChip cls={value.value_class} /> : null}
    </div>
  );
}

/** Prominent label on every money screen: nothing here is an accounting entry. */
export function NotPostedBanner() {
  return (
    <div
      role="note"
      data-testid="mfg-money-not-posted"
      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
    >
      {MONEY_NOT_POSTED_LABEL}
    </div>
  );
}

/** Read-only slide-over panel (Escape, backdrop or the X closes it). */
export function DetailDrawer({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
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
  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-2xl flex-col bg-surface-raised shadow-2xl outline-none"
      >
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
            aria-label="Close details"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Small "label: value" list used inside the drawer and cards. */
export function KeyValues({ rows }: { rows: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2 border-b border-border/50 py-1" title={r.hint}>
          <dt className="text-text-muted">{r.label}</dt>
          <dd className="text-right text-text-primary">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
