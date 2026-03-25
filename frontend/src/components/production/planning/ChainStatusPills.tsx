import type { ChainStepStatus } from "@/types/productionPlanning";

const LABELS: Record<string, string> = {
  style_linked: "Style",
  ob_ready: "OB",
  customer_approval: "Approval",
  material_readiness: "Materials",
  line_allocated: "Line",
};

function dotClass(s: ChainStepStatus | string): string {
  switch (s) {
    case "ready":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "blocked":
      return "bg-red-500";
    case "not_started":
      return "bg-slate-400";
    default:
      return "bg-slate-300";
  }
}

type ChainLike = Record<
  string,
  { status?: string; detail?: string } | undefined
> | null;

type Props = {
  chain: ChainLike;
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  compact?: boolean;
};

export function ChainStatusPills({ chain, onSelect, selectedKey, compact }: Props) {
  if (!chain) {
    return <span className="text-xs text-text-muted">—</span>;
  }
  const keys = ["style_linked", "ob_ready", "customer_approval", "material_readiness", "line_allocated"] as const;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "gap-2"}`}>
      {keys.map((k) => {
        const step = chain[k];
        const st = (step?.status ?? "not_started") as ChainStepStatus;
        const label = LABELS[k] ?? k;
        const sel = selectedKey === k;
        return (
          <button
            key={k}
            type="button"
            title={step?.detail ?? label}
            onClick={() => onSelect?.(k)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              sel ? "border-brand-primary bg-brand-primary/10" : "border-border-subtle bg-surface-subtle"
            } ${onSelect ? "cursor-pointer hover:bg-surface-elevated" : ""}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(st)}`} />
            <span className="text-text-secondary">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
