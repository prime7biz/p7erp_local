import type { FieldConfidence } from "@/types/extraction";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  level: FieldConfidence;
  score: number;
  className?: string;
};

export function FieldConfidenceBadge({ level, score, className }: Props) {
  const pct = Math.round(score * 100);
  const label = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
  const colors =
    level === "high"
      ? "bg-status-success/15 text-status-success border-status-success/30"
      : level === "medium"
        ? "bg-status-warning/15 text-status-warning border-status-warning/30"
        : "bg-status-danger/15 text-status-danger border-status-danger/30";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-default items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
              colors,
              className,
            )}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Confidence: {pct}%
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
