import { Calendar } from "lucide-react";
import type { AiWeeklyReportItem } from "@/api/client";

function weekShort(iso: string) {
  return iso.slice(0, 10);
}

export function AiWeeklyReportListPanel({
  items,
  selectedId,
  onSelect,
  currentWeekStart,
}: {
  items: AiWeeklyReportItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  currentWeekStart: string | null;
}) {
  return (
    <div className="space-y-1">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">History</h2>
      {items.map((row) => {
        const isSel = row.id === selectedId;
        const isCurrent = currentWeekStart != null && row.week_start === currentWeekStart;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            className={
              isSel
                ? "w-full rounded-lg border border-brand-primary/50 bg-surface-subtle px-3 py-2 text-left"
                : "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-left hover:bg-surface-subtle"
            }
          >
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {weekShort(row.week_start)} – {weekShort(row.week_end)}
              </span>
              {isCurrent && (
                <span className="rounded bg-surface-subtle px-1 py-0.5 text-[10px] font-medium text-text-primary">This week</span>
              )}
            </div>
            <div className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{row.narrative.replace(/\n/g, " ")}</div>
          </button>
        );
      })}
    </div>
  );
}
