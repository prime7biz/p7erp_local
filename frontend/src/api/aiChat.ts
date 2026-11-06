/**
 * AI assistant chat API calls used by the always-mounted AI drawer (AiChatContext).
 * Also merged into `api` in `api/client.ts`, so `api.aiSendMessage()` etc. still work.
 */
import { request } from "@/api/core";
import type { AiChatResponse, AiMessageResponse, AiSessionResponse } from "@/api/models";

export const aiChatApi = {
  async aiListSessions(params?: { limit?: number; offset?: number }): Promise<AiSessionResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiSessionResponse[]>(`/api/v1/ai-tool/sessions${suffix}`);
  },
  async aiCreateSession(data?: { title?: string | null }): Promise<AiSessionResponse> {
    return request<AiSessionResponse>("/api/v1/ai-tool/sessions", {
      method: "POST",
      body: JSON.stringify({ title: data?.title ?? null }),
    });
  },
  async aiListMessages(sessionId: number): Promise<AiMessageResponse[]> {
    return request<AiMessageResponse[]>(`/api/v1/ai-tool/sessions/${sessionId}/messages`);
  },
  async aiSendMessage(
    sessionId: number,
    prompt: string,
    context?: { route?: string; record_type?: string; record_id?: number } | null,
  ): Promise<AiChatResponse> {
    return request<AiChatResponse>(`/api/v1/ai-tool/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(context ? { prompt, context } : { prompt }),
    });
  },
  async aiApproveEscalation(
    sessionId: number,
    data: { message_id: number; tool_required: string; approved?: boolean },
  ): Promise<AiChatResponse> {
    return request<AiChatResponse>(`/api/v1/ai-tool/sessions/${sessionId}/approve-escalation`, {
      method: "POST",
      body: JSON.stringify({
        message_id: data.message_id,
        tool_required: data.tool_required,
        approved: data.approved ?? true,
      }),
    });
  },
};
