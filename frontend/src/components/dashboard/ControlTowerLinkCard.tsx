import { Link } from "react-router-dom";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ControlTowerLinkCard() {
  return (
    <Link to="/app/operations/control-tower" className="block">
      <Card variant="interactive" className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl bg-surface-subtle p-2.5">
            <LayoutGrid className="h-5 w-5 text-text-secondary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">Operations Control Tower</p>
            <p className="truncate text-xs text-text-muted">
              Order execution, capacity, LC ladder, and alerts in one place.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
      </Card>
    </Link>
  );
}
