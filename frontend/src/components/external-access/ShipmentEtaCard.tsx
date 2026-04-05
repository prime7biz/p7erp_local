export function ShipmentEtaCard({
  etd,
  eta,
}: {
  etd?: string | null;
  eta?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm">
      <div className="flex flex-wrap gap-4 text-text-muted">
        {etd ? <span>ETD: {etd}</span> : null}
        {eta ? <span>ETA: {eta}</span> : null}
        {!etd && !eta ? <span>Dates TBD</span> : null}
      </div>
    </div>
  );
}
