/** Three score cards: OTD avg, maturity safety, cashability. */

function ScoreCard({
  label,
  value,
  shell,
}: {
  label: string;
  value: number | null | undefined;
  shell: string;
}) {
  const v = typeof value === "number" && !Number.isNaN(value) ? Math.min(100, Math.max(0, value)) : null;
  const pct = v ?? 0;
  const bar =
    v != null ? (v >= 70 ? "bg-emerald-500" : v >= 45 ? "bg-amber-500" : "bg-rose-500") : "bg-surface-muted";
  return (
    <div className={`rounded-2xl border p-4 ${shell}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-text-primary">{v != null ? Math.round(v) : "—"}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-text-muted">0–100 (higher is safer / on-time)</p>
    </div>
  );
}

export function ContractScoreDials({
  otd,
  maturity,
  cash,
}: {
  otd: number | null | undefined;
  maturity: number | null | undefined;
  cash: number | null | undefined;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ScoreCard label="Delivery (OTD)" value={otd} shell="border-sky-200/80 bg-sky-500/5 dark:border-sky-900/40" />
      <ScoreCard label="BTB maturity" value={maturity} shell="border-violet-200/80 bg-violet-500/5 dark:border-violet-900/40" />
      <ScoreCard label="Cash / CM" value={cash} shell="border-emerald-200/80 bg-emerald-500/5 dark:border-emerald-900/40" />
    </div>
  );
}
