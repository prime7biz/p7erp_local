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
  /** Deep links to the record(s) the answer is about (e.g. the order open on screen). */
  citations?: { label: string; href: string; record_type?: string | null }[];
  /** Phase-2 response envelope */
  provenance?: AiResponseProvenance;
  trace_spans?: AiTraceSpan[];
  /** "agent" when the AI picked its own read-only tools (tenant flag ai_agent_mode_enabled). */
  mode?: string;
  agent?: { model?: string; steps?: number; tool_calls?: number };
}
