export function PortalPageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 w-48 rounded bg-border" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-surface-raised" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border bg-surface-raised" />
    </div>
  );
}
