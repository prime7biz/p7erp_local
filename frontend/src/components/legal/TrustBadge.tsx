import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?: "default" | "outline" | "muted" | "inverse";
  className?: string;
};

const variants: Record<NonNullable<Props["variant"]>, string> = {
  default: "bg-brand-primary/10 text-brand-primary border-brand-primary/20",
  outline: "bg-transparent text-text-secondary border-border",
  muted: "bg-surface-subtle text-text-secondary border-border",
  inverse: "border-white/30 text-text-inverse bg-white/10",
};

export function TrustBadge({ children, variant = "default", className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
