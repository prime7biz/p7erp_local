import type { ReactNode } from "react";

/**
 * Titled card used inside finance drawers and advanced forms
 * (same visual language as the voucher entry section cards).
 */
export function FormSection({
  title,
  description,
  children,
  actions,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface-raised p-4 ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
