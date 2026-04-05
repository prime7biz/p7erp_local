import type { ReactNode } from "react";

interface CalloutBoxProps {
  title?: string;
  children: ReactNode;
  variant?: "info" | "tip" | "warn";
}

const variantClass: Record<NonNullable<CalloutBoxProps["variant"]>, string> = {
  info: "border-brand-primary/30 bg-brand-primary/5",
  tip: "border-emerald-500/30 bg-emerald-500/5",
  warn: "border-amber-500/40 bg-amber-500/5",
};

/**
 * Standalone callout (also used from markdown blockquotes).
 */
export function CalloutBox({ title, children, variant = "info" }: CalloutBoxProps) {
  return (
    <aside
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed text-text-secondary ${variantClass[variant]}`}
    >
      {title ? <p className="mb-1 font-semibold text-text-primary">{title}</p> : null}
      <div className="[&_p]:mt-2 [&_p:first-child]:mt-0">{children}</div>
    </aside>
  );
}
