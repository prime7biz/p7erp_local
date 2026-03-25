export function HrEmptyState(props: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-subtle px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-primary">{props.title}</p>
      {props.hint ? <p className="mt-1 text-xs text-text-muted">{props.hint}</p> : null}
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}
