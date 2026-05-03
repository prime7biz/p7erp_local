import { ApiError } from "@/api/client";

export function formatAiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429)
      return `Rate limit reached. Please wait a few seconds and retry.${err.requestId ? ` (trace: ${err.requestId})` : ""}`;
    if (err.status === 504)
      return `Request timed out. Try a smaller scope or retry.${err.requestId ? ` (trace: ${err.requestId})` : ""}`;
    if (err.status === 403) return `Permission denied: ${err.message}${err.requestId ? ` (trace: ${err.requestId})` : ""}`;
    return `${err.message}${err.requestId ? ` (trace: ${err.requestId})` : ""}`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
