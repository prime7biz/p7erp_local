import { useId, useState, type ReactNode } from "react";
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
  const panelId = useId();
  const buttonId = useId();

  return (
    <section className={cn("rounded-2xl border border-border bg-surface-raised shadow-sm", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 md:px-5">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="text-left text-sm font-semibold text-text-primary transition-colors hover:text-brand-primary"
        >
          {open ? "▼" : "▶"} {title}
        </button>
        {actions ? <div>{actions}</div> : null}
      </header>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="p-4 md:p-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
