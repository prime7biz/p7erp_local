import { cn } from "@/utils/cn";

type Variant = "success" | "warning" | "danger" | "neutral" | "info";

const variants: Record<Variant, string> = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-indigo-100 text-indigo-800",
};

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
