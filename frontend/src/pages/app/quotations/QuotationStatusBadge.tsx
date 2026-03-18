import { cn } from "@/lib/utils";

export function QuotationStatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED"
      ? "bg-status-success-subtle text-status-success-foreground border-status-success/25"
      : status === "CONVERTED"
        ? "bg-status-success-subtle text-status-success-foreground border-status-success/25"
      : status === "SUBMITTED"
        ? "bg-status-info-subtle text-status-info-foreground border-status-info/25"
        : status === "SENT"
          ? "bg-brand-primary/10 text-brand-primary border-brand-primary/25"
          : status === "REJECTED" || status === "CANCELLED"
            ? "bg-status-danger-subtle text-status-danger-foreground border-status-danger/25"
          : "bg-status-neutral-subtle text-status-neutral-foreground border-border";

  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", cls)}>{status}</span>;
}
