const variants: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
  inactive: "bg-gray-500/15 text-gray-700 border-gray-500/30",
  pending: "bg-amber-500/15 text-amber-900 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-800 border-red-500/30",
  draft: "bg-slate-500/15 text-slate-800 border-slate-500/30",
  default: "bg-surface-subtle text-text-secondary border-border",
};

export function HrStatusBadge(props: { status: string }) {
  const key = props.status.toLowerCase();
  const cls = variants[key] ?? variants.default;
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {props.status.replace(/_/g, " ")}
    </span>
  );
}
