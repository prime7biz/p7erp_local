export function AiStateNotice({ message, type = "info" }: { message: string; type?: "info" | "error" }) {
  const classes =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  const lower = message.toLowerCase();
  const retryHint =
    type === "error" && (lower.includes("rate limit") || lower.includes("timed out"))
      ? " You can retry shortly. If this keeps happening, reduce request scope."
      : "";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>{message}{retryHint}</div>;
}
