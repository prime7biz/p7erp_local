import { useState } from "react";

interface Props {
  sending: boolean;
  disabled?: boolean;
  onSend: (prompt: string) => Promise<void> | void;
}

export function AiPromptInput({ sending, disabled, onSend }: Props) {
  const [prompt, setPrompt] = useState("");

  const handleSend = async () => {
    const value = prompt.trim();
    if (!value || sending || disabled) return;
    setPrompt("");
    await onSend(value);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className="mb-2 block text-sm font-semibold text-slate-800">Ask AI Tool</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask about dashboard, approvals, orders, inventory, production, or finance..."
          disabled={sending || disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || disabled || !prompt.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
