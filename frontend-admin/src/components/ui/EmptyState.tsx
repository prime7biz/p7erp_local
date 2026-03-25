type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="text-sm mt-2">{description}</p> : null}
    </div>
  );
}
