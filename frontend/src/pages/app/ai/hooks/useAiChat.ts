import { useEffect } from "react";
import { useAiChatContext } from "@/context/AiChatContext";

export function useAiChat(activeSessionId: number | null) {
  const ai = useAiChatContext();

  useEffect(() => {
    if (activeSessionId && activeSessionId !== ai.activeSessionId) {
      ai.setActiveSessionId(activeSessionId);
      void ai.loadMessages(activeSessionId);
    }
  }, [activeSessionId, ai]);

  return {
    messages: ai.messages,
    loadingMessages: ai.loadingMessages,
    sending: ai.sending,
    approvingEscalationId: ai.approvingEscalationId,
    error: ai.error,
    loadMessages: () => ai.loadMessages(activeSessionId),
    sendMessage: (prompt: string) => ai.sendMessage(prompt, activeSessionId),
    approveEscalation: (messageId: number, toolRequired: string) =>
      ai.approveEscalation(messageId, toolRequired, activeSessionId),
    cancelEscalation: ai.cancelEscalation,
    lastToolResults: ai.lastToolResults,
    setError: ai.setError,
  };
}
