import type {
  AiMessageResponse,
  AiResponseProvenance,
  AiSessionResponse,
  AiToolInvocationResult,
  AiTraceSpan,
} from "@/api/client";

export interface AiAssistantState {
  sessions: AiSessionResponse[];
  activeSessionId: number | null;
  messages: AiMessageResponse[];
  quickActions: Array<{ key: string; label: string; prompt: string; source_area: string }>;
  loadingSessions: boolean;
  loadingMessages: boolean;
  sending: boolean;
  error: string;
}

export interface AiAssistantMessageMeta {
  request_id?: string;
  intent?: string;
  confidence?: number;
  primary_route?: string;
  suggest_premium?: boolean;
  blocked?: boolean;
  tool_results?: AiToolInvocationResult[];
  escalation_pending?: boolean;
  tool_required?: string;
  reason?: string;
  escalation_approved?: boolean;
  /** Phase-2 response envelope */
  provenance?: AiResponseProvenance;
  trace_spans?: AiTraceSpan[];
}
