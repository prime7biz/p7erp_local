interface DocumentStatusBadgeProps {
  status: string | null | undefined;
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const value = (status || "").toUpperCase();
  let cls = "bg-surface-subtle text-text-secondary";
  if (["APPROVED", "POSTED", "RECEIVED", "RELEASED", "COMPLETED"].includes(value)) {
    cls = "bg-status-success-subtle text-status-success-foreground";
  } else if (["SUBMITTED", "CHECKED", "RECOMMENDED", "IN_PROGRESS", "ON_HOLD"].includes(value)) {
    cls = "bg-status-warning-subtle text-status-warning-foreground";
  } else if (["REJECTED", "CANCELLED"].includes(value)) {
    cls = "bg-status-danger-subtle text-status-danger-foreground";
  }
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{value || "—"}</span>;
}
