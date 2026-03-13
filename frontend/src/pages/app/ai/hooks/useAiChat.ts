import { useCallback, useEffect, useState } from "react";
import { api, type AiMessageResponse, type AiToolInvocationResult } from "@/api/client";

export function useAiChat(activeSessionId: number | null) {
  const [messages, setMessages] = useState<AiMessageResponse[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastToolResults, setLastToolResults] = useState<AiToolInvocationResult[]>([]);

  const loadMessages = useCallback(async () => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    setError("");
    try {
      const rows = await api.aiListMessages(activeSessionId);
      setMessages(rows);
      const lastAssistant = [...rows].reverse().find((x) => x.role === "assistant");
      const raw = (lastAssistant?.content_json || {}) as { tool_results?: AiToolInvocationResult[] };
      setLastToolResults(Array.isArray(raw.tool_results) ? raw.tool_results : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI messages");
    } finally {
      setLoadingMessages(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!activeSessionId) return false;
      setSending(true);
      setError("");
      try {
        const result = await api.aiSendMessage(activeSessionId, prompt);
        setMessages((prev) => [...prev, result.user_message, result.assistant_message]);
        setLastToolResults(result.tool_results || []);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send message");
        return false;
      } finally {
        setSending(false);
      }
    },
    [activeSessionId]
  );

  return {
    messages,
    loadingMessages,
    sending,
    error,
    loadMessages,
    sendMessage,
    lastToolResults,
    setError,
  };
}
