import type { AiMessageResponse, AiResponseProvenance, AiTraceSpan } from "@/api/client";
import type { AiAssistantMessageMeta } from "@/pages/app/ai/types";

export function formatRelative(iso: string | null): string {
  if (!iso) return "Just now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

export function readMessageMeta(message: AiMessageResponse): AiAssistantMessageMeta {
  const raw = message.content_json;
  if (!raw || typeof raw !== "object") return {};
  return raw as AiAssistantMessageMeta;
}

export function readProvenance(message: AiMessageResponse): AiResponseProvenance | null {
  const meta = readMessageMeta(message);
  const p = meta.provenance;
  if (!p || typeof p !== "object") return null;
  return p as AiResponseProvenance;
}

export function readTraceSpans(message: AiMessageResponse): AiTraceSpan[] {
  const meta = readMessageMeta(message);
  const s = meta.trace_spans;
  return Array.isArray(s) ? s : [];
}
