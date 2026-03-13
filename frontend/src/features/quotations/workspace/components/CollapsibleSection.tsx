import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  actions,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("rounded-2xl border border-gray-200 bg-white", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left text-sm font-semibold text-gray-900"
        >
          {open ? "▼" : "▶"} {title}
        </button>
        {actions ? <div>{actions}</div> : null}
      </header>
      {open ? <div className="p-4">{children}</div> : null}
    </section>
  );
}
