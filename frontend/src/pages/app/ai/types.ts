import type { AiMessageResponse, AiSessionResponse, AiToolInvocationResult } from "@/api/client";

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
  blocked?: boolean;
  tool_results?: AiToolInvocationResult[];
}
