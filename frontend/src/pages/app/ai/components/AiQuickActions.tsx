import type { AiQuickAction } from "@/api/client";

interface Props {
  actions: AiQuickAction[];
  disabled?: boolean;
  onRun: (prompt: string) => void;
}

export function AiQuickActions({ actions, disabled, onRun }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Quick Actions</h2>
      {actions.length === 0 ? (
        <p className="text-sm text-slate-500">No quick actions found.</p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={disabled}
              onClick={() => onRun(action.prompt)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-xs text-slate-500">{action.source_area}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
