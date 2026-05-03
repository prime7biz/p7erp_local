import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function AiAutomationHeader() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">AI Automation</h1>
        <p className="text-sm text-text-muted">
          Data quality scans, controlled draft actions, governance proposals, and the rule catalog. Nothing is posted
          automatically; every execution step requires human confirmation.
        </p>
      </div>
      <Link
        to="/app/ai/assistant"
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
      >
        <Sparkles className="h-3.5 w-3.5" /> Open AI Assistant
      </Link>
    </div>
  );
}
