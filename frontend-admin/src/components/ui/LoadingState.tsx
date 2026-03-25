export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}
