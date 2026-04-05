import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export function StatusCard({ title, children, icon: Icon, className = "" }: Props) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface-raised p-5 sm:p-6 shadow-sm hover:border-brand-primary/20 transition-colors print:shadow-none print:break-inside-avoid ${className}`}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-text-primary mb-2">{title}</h3>
          <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}
