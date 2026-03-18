export function AiStateNotice({ message, type = "info" }: { message: string; type?: "info" | "error" }) {
  const classes =
    type === "error"
      ? "border-status-danger/20 bg-status-danger-subtle text-status-danger-foreground"
      : "border-border bg-surface-subtle text-text-secondary";
  const lower = message.toLowerCase();
  const retryHint =
    type === "error" && (lower.includes("rate limit") || lower.includes("timed out"))
      ? " You can retry shortly. If this keeps happening, reduce request scope."
      : "";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>{message}{retryHint}</div>;
}
