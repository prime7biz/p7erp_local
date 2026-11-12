import { useState, type ReactNode } from "react";

/**
 * Puts a visible label above a placeholder-only field on phones (`enabled`), where a filled-in
 * value hides the placeholder; elsewhere the field renders exactly as before.
 */
export function PhoneFieldLabel({ enabled, label, children }: { enabled: boolean; label: string; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <label className="flex flex-col gap-0.5 text-xs text-text-muted [&>input]:w-full [&>select]:w-full">
      {label}
      {children}
    </label>
  );
}

/**
 * Folds an optional group of form fields behind a tappable title on phones (`enabled`, normally
 * `useMobileUiV2Phone()`); elsewhere the fields render exactly as before. Folding only hides the
 * fields: their values stay in the form and are still sent on save.
 */
export function PhoneDisclosure({
  enabled,
  title,
  defaultOpen = false,
  children,
}: {
  enabled: boolean;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // Read once: the fold must not snap shut when the user clears the last value while typing.
  const [initiallyOpen] = useState(defaultOpen);
  if (!enabled) return <>{children}</>;
  return (
    <details open={initiallyOpen} className="rounded-lg border border-border px-3 pb-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-primary">{title}</summary>
      <div className="pt-1">{children}</div>
    </details>
  );
}
