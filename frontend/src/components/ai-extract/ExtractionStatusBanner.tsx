import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractionStatus } from "@/types/extraction";

type Props = {
  status: ExtractionStatus;
  extractedCount?: number;
  warnings?: string[];
  error?: string | null;
  className?: string;
};

export function ExtractionStatusBanner({ status, extractedCount = 0, warnings = [], error, className }: Props) {
  if (status === "idle" || status === "uploading") return null;

  if (status === "failed") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger",
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Extraction failed</p>
          {error ? <p className="text-text-secondary mt-0.5">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (status === "partial") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-text-primary",
          className,
        )}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
        <div>
          <p className="font-medium">Partial extraction</p>
          {warnings.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-text-secondary">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-text-secondary mt-0.5">Some fields could not be detected confidently.</p>
          )}
        </div>
      </div>
    );
  }

  if (status === "extracted") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-sm text-text-primary",
          className,
        )}
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
        <div>
          <p className="font-medium">Extracted successfully</p>
          <p className="text-text-secondary mt-0.5">
            {extractedCount} field{extractedCount === 1 ? "" : "s"} ready for review.
            {warnings.length > 0 ? " See warnings below." : ""}
          </p>
          {warnings.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-text-secondary">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
