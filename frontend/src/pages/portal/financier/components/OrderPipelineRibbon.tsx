/** Horizontal order lifecycle ribbon from pipeline milestone steps. */

type Step = { name: string; status: string };

function stepClass(status: string) {
  const s = status.toLowerCase();
  if (s === "done") return "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-400/40";
  if (s === "current") return "bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-400/40";
  if (s === "na") return "bg-surface-muted text-text-muted border-border opacity-60";
  return "bg-surface-muted text-text-muted border-border";
}

export function OrderPipelineRibbon({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-1">
        {steps.map((n) => (
          <div
            key={n.name}
            className={`rounded-lg border px-2 py-1 text-[10px] font-medium ${stepClass(n.status)}`}
            title={n.name}
          >
            {n.name.replace(/_/g, " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
