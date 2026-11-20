import type { KpiCard as KpiCardData } from "../../api/kpiEngine";

const STATUS_CLASS: Record<string, string> = {
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-800",
  AMBER: "border-amber-200 bg-amber-50 text-amber-900",
  RED: "border-red-200 bg-red-50 text-red-800",
  NO_DATA: "border-border bg-surface-muted text-text-muted",
  NO_TARGET: "border-border bg-surface text-text-primary",
};

type Props = {
  card: KpiCardData;
  onDrill?: (code: string) => void;
};

export function KpiCard({ card, onDrill }: Props) {
  const { definition: d, value: v } = card;
  const statusClass = STATUS_CLASS[v.status] || STATUS_CLASS.NO_DATA;
  const display =
    v.value == null
      ? "—"
      : d.unit === "money"
        ? Number(v.value).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : d.unit === "%"
          ? `${Number(v.value).toFixed(1)}%`
          : Number(v.value).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <button
      type="button"
      onClick={() => onDrill?.(d.code)}
      className={`flex w-full flex-col rounded-lg border p-3 text-left transition hover:shadow-sm ${statusClass}`}
      title={d.purpose || d.name}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">{d.code}</span>
        <span className="text-[10px] uppercase">{v.status.replace("_", " ")}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-inherit">{d.name}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{display}</div>
      {d.owner_role ? <div className="mt-1 text-[11px] opacity-70">Owner: {d.owner_role}</div> : null}
      {v.missing_inputs?.length ? (
        <div className="mt-1 text-[11px] opacity-70">Missing: {v.missing_inputs.slice(0, 2).join(", ")}</div>
      ) : null}
      {d.blocked_reason ? (
        <div className="mt-1 text-[11px] font-medium opacity-80">Blocked: {d.blocked_reason}</div>
      ) : null}
      <div className="mt-2 text-[10px] opacity-60">
        Freshness {v.source_event_time || v.as_of} · v{v.formula_version}
      </div>
    </button>
  );
}
