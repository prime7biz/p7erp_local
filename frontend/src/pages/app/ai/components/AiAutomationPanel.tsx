import { useState } from "react";
import type { AiActionRunResponse } from "@/api/client";

interface Props {
  disabled?: boolean;
  runs: AiActionRunResponse[];
  loading: boolean;
  onPropose: (prompt: string) => Promise<void>;
  onConfirm: (actionRunId: number, token: string) => Promise<void>;
}

export function AiAutomationPanel({ disabled, runs, loading, onPropose, onConfirm }: Props) {
  const [prompt, setPrompt] = useState("Create follow-up reminder for order 123");
  const [confirmTokens, setConfirmTokens] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const runPropose = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      await onPropose(prompt.trim());
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async (actionRunId: number) => {
    const token = (confirmTokens[actionRunId] || "").trim();
    if (!token) return;
    setBusy(true);
    try {
      await onConfirm(actionRunId, token);
    } finally {
      setBusy(false);
    }
  };

  const statusClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === "EXECUTED") return "text-emerald-700";
    if (s === "FAILED") return "text-red-700";
    if (s === "PROPOSED") return "text-amber-700";
    return "text-slate-600";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">Controlled Automation</h2>
      <p className="mb-2 text-xs text-slate-500">Proposal first, then explicit confirmation token before execution.</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        disabled={disabled || busy}
      />
      <button
        type="button"
        onClick={() => void runPropose()}
        disabled={disabled || busy}
        className="mt-2 w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Propose Action
      </button>

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-slate-500">Loading action runs...</p>
        ) : runs.length === 0 ? (
          <p className="text-xs text-slate-500">No action proposals yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 6).map((run) => (
              <div key={run.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800">{run.action_key}</div>
                  <div className={`rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ${statusClass(run.status)}`}>{run.status}</div>
                </div>
                <p className="mt-1 text-[11px] text-slate-700">{run.preview_text || run.prompt_text}</p>
                <p className="mt-1 text-[11px] text-slate-500">Risk: {run.risk_level}</p>
                {run.status === "PROPOSED" ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-amber-700">
                      Confirmation token (shown once): {run.confirmation_token ?? run.confirmation_token_hint ?? "Use latest proposal token"}
                    </p>
                    <input
                      type="text"
                      value={confirmTokens[run.id] || ""}
                      onChange={(e) => setConfirmTokens((prev) => ({ ...prev, [run.id]: e.target.value }))}
                      placeholder="Enter confirmation token"
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      disabled={disabled || busy}
                    />
                    <button
                      type="button"
                      onClick={() => void runConfirm(run.id)}
                      disabled={disabled || busy}
                      className="w-full rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Confirm and Execute
                    </button>
                  </div>
                ) : null}
                {run.error_text ? <p className="mt-1 text-[11px] text-red-600">{run.error_text}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
