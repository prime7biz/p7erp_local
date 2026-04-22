/** Horizontal lifecycle ribbon (compact). */

export function ContractTimelineRibbon({ nodes }: { nodes: { id: string; status: string }[] }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-1">
        {nodes.map((n) => {
          const ok = n.status === "ok";
          const amber = n.status === "amber";
          const cls = ok
            ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-400/40"
            : amber
              ? "bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-400/40"
              : "bg-surface-muted text-text-muted border-border";
          return (
            <div
              key={n.id}
              className={`rounded-lg border px-2 py-1 text-[10px] font-medium capitalize ${cls}`}
              title={n.id}
            >
              {n.id.replace(/_/g, " ")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
