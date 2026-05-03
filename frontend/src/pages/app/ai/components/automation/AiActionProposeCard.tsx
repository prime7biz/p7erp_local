import { useState } from "react";
import { KeyRound, Send } from "lucide-react";
import type { AiActionRunResponse } from "@/api/client";

interface Props {
  freshRun: AiActionRunResponse | null;
  onPropose: (prompt: string) => Promise<void>;
  onConfirm: (id: number, token: string) => Promise<void>;
}

const EXAMPLES = [
  "Create follow-up reminder for order 123",
  "Draft a message to the customer about delayed shipment",
  "Prepare a draft business summary for the last 7 days",
  "Trade case document due reminder",
];

export function AiActionProposeCard({ freshRun, onPropose, onConfirm }: Props) {
  const [prompt, setPrompt] = useState<string>(EXAMPLES[0] ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const propose = async () => {
    setBusy(true);
    try {
      await onPropose(prompt);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!freshRun) return;
    setBusy(true);
    try {
      await onConfirm(freshRun.id, token);
      setToken("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Propose a draft action</h2>
        <p className="text-xs text-text-muted">
          The system maps your text to an automation rule, stores a proposed run, and shows a one-time confirmation
          token. Nothing executes until you confirm.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Describe the draft action..."
        className="w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-focus-ring focus:ring-1 focus:ring-focus-ring"
        disabled={busy}
      />

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-subtle"
          >
            {ex}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void propose()}
        disabled={busy || !prompt.trim()}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground disabled:cursor-not-allowed disabled:bg-status-neutral-subtle"
      >
        <Send className="h-3.5 w-3.5" /> Propose action
      </button>

      {freshRun ? (
        <div className="space-y-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle p-3">
          <div className="flex items-center gap-2 text-xs text-status-warning-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            <span>One-time confirmation token &mdash; copy before leaving this section:</span>
          </div>
          <code className="block break-all rounded bg-surface-raised px-2 py-1 font-mono text-xs">
            {freshRun.confirmation_token ?? freshRun.confirmation_token_hint ?? "(not returned)"}
          </code>
          <p className="text-[11px] text-text-secondary">
            Action: <b>{freshRun.action_key}</b> &middot; Risk: {freshRun.risk_level}
          </p>
          <p className="whitespace-pre-wrap text-[11px] text-text-secondary">
            {freshRun.preview_text || freshRun.prompt_text}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token"
              className="flex-1 rounded-md border border-border-strong px-2 py-1 text-xs"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !token.trim()}
              className="rounded-md bg-status-success px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-status-neutral-subtle"
            >
              Confirm and execute
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
