import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type KPICardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
};

export function KPICard({ label, value, hint, className }: KPICardProps) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
      {hint ? <p className="text-xs text-slate-500 mt-2">{hint}</p> : null}
    </div>
  );
}
