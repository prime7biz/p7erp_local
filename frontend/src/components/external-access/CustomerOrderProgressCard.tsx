import { Badge } from "@/components/ui/badge";

export function CustomerOrderProgressCard({ status, hint }: { status: string; hint?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">Status</span>
        <Badge variant="secondary">{status}</Badge>
      </div>
      {hint ? <p className="mt-2 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
