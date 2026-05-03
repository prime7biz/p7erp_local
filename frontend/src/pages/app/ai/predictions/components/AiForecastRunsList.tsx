import type { AiForecastRunResponse } from "@/api/client";
import { ForecastRunCard } from "@/pages/app/ai/predictions/components/ForecastRunCard";

interface Props {
  runs: AiForecastRunResponse[];
  loading: boolean;
  onOpen?: (id: number) => void;
}

export function AiForecastRunsList({ runs, loading, onOpen }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Forecast runs</h2>
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-text-muted">No forecasts match your filters.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <ForecastRunCard key={r.id} run={r} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
