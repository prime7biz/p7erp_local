import type { AiSessionResponse } from "@/api/client";
import { formatRelative } from "@/pages/app/ai/utils/aiFormatting";

interface Props {
  sessions: AiSessionResponse[];
  activeSessionId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
}

export function AiSessionList({ sessions, activeSessionId, loading, onSelect, onCreate }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">AI Sessions</h2>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
        >
          New
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  active ? "border-primary bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="truncate text-sm font-medium text-slate-800">{session.title || "Untitled Session"}</div>
                <div className="mt-1 text-xs text-slate-500">{formatRelative(session.last_message_at || session.created_at)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
