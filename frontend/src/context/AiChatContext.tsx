import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type AiMessageResponse, type AiToolInvocationResult } from "@/api/client";

const LAST_SESSION_KEY = "p7_ai_last_session_id";

interface AiChatContextValue {
  activeSessionId: number | null;
  messages: AiMessageResponse[];
  loadingMessages: boolean;
  sending: boolean;
  approvingEscalationId: number | null;
  error: string;
  lastToolResults: AiToolInvocationResult[];
  widgetOpen: boolean;
  loadingBootstrap: boolean;
  setError: (value: string) => void;
  setActiveSessionId: (sessionId: number | null) => void;
  ensureSession: () => Promise<number | null>;
  createSession: () => Promise<number | null>;
  loadMessages: (sessionId?: number | null) => Promise<void>;
  sendMessage: (prompt: string, sessionId?: number | null) => Promise<boolean>;
  approveEscalation: (messageId: number, toolRequired: string, sessionId?: number | null) => Promise<boolean>;
  cancelEscalation: (messageId: number) => void;
  setWidgetOpen: (open: boolean) => void;
  toggleWidget: () => void;
}

const AiChatContext = createContext<AiChatContextValue | null>(null);

function getSavedSessionId(): number | null {
  const raw = Number(localStorage.getItem(LAST_SESSION_KEY) || "0");
  return raw > 0 ? raw : null;
}

export function AiChatProvider({ children }: { children: React.ReactNode }) {
  const [activeSessionId, setActiveSessionIdState] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessageResponse[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [approvingEscalationId, setApprovingEscalationId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastToolResults, setLastToolResults] = useState<AiToolInvocationResult[]>([]);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);

  const setActiveSessionId = useCallback((sessionId: number | null) => {
    setActiveSessionIdState(sessionId);
    if (sessionId) {
      localStorage.setItem(LAST_SESSION_KEY, String(sessionId));
    } else {
      localStorage.removeItem(LAST_SESSION_KEY);
    }
  }, []);

  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (activeSessionId) return activeSessionId;
    setError("");
    try {
      const rows = await api.aiListSessions({ limit: 50, offset: 0 });
      const saved = getSavedSessionId();
      const picked = saved && rows.some((x) => x.id === saved) ? saved : rows[0]?.id ?? null;
      if (picked) {
        setActiveSessionId(picked);
        return picked;
      }
      const created = await api.aiCreateSession({ title: "New AI Session" });
      setActiveSessionId(created.id);
      return created.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize AI session");
      return null;
    }
  }, [activeSessionId, setActiveSessionId]);

  const createSession = useCallback(async (): Promise<number | null> => {
    setError("");
    try {
      const created = await api.aiCreateSession({ title: "New AI Session" });
      setActiveSessionId(created.id);
      return created.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create AI session");
      return null;
    }
  }, [setActiveSessionId]);

  const loadMessages = useCallback(
    async (sessionId?: number | null) => {
      const sid = sessionId ?? activeSessionId;
      if (!sid) {
        setMessages([]);
        setLastToolResults([]);
        return;
      }
      setLoadingMessages(true);
      setError("");
      try {
        const rows = await api.aiListMessages(sid);
        setMessages(rows);
        const lastAssistant = [...rows].reverse().find((x) => x.role === "assistant");
        const raw = (lastAssistant?.content_json || {}) as { tool_results?: AiToolInvocationResult[] };
        setLastToolResults(Array.isArray(raw.tool_results) ? raw.tool_results : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load AI messages");
      } finally {
        setLoadingMessages(false);
      }
    },
    [activeSessionId]
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const token = localStorage.getItem("p7_token");
      const tenantId = localStorage.getItem("p7_tenant_id");
      if (!token || !tenantId) {
        if (!cancelled) setLoadingBootstrap(false);
        return;
      }
      const sid = await ensureSession();
      if (!cancelled && sid) {
        await loadMessages(sid);
      }
      if (!cancelled) setLoadingBootstrap(false);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [ensureSession, loadMessages]);

  const sendMessage = useCallback(
    async (prompt: string, sessionId?: number | null) => {
      const sid = sessionId ?? activeSessionId ?? (await ensureSession());
      if (!sid) return false;
      if (sid !== activeSessionId) setActiveSessionId(sid);
      setSending(true);
      setError("");
      try {
        const result = await api.aiSendMessage(sid, prompt);
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
    [activeSessionId, ensureSession, setActiveSessionId]
  );

  const approveEscalation = useCallback(
    async (messageId: number, toolRequired: string, sessionId?: number | null) => {
      const sid = sessionId ?? activeSessionId;
      if (!sid) return false;
      setApprovingEscalationId(messageId);
      setError("");
      try {
        const result = await api.aiApproveEscalation(sid, {
          message_id: messageId,
          tool_required: toolRequired,
          approved: true,
        });
        setMessages((prev) => [...prev, result.assistant_message]);
        setLastToolResults(result.tool_results || []);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to approve escalation");
        return false;
      } finally {
        setApprovingEscalationId(null);
      }
    },
    [activeSessionId]
  );

  const cancelEscalation = useCallback((messageId: number) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          content: "Escalation cancelled by user.",
          content_json: {
            ...(msg.content_json || {}),
            escalation_pending: false,
            escalation_cancelled: true,
          },
        };
      })
    );
  }, []);

  const toggleWidget = useCallback(() => setWidgetOpen((prev) => !prev), []);

  const value = useMemo<AiChatContextValue>(
    () => ({
      activeSessionId,
      messages,
      loadingMessages,
      sending,
      approvingEscalationId,
      error,
      lastToolResults,
      widgetOpen,
      loadingBootstrap,
      setError,
      setActiveSessionId,
      ensureSession,
      createSession,
      loadMessages,
      sendMessage,
      approveEscalation,
      cancelEscalation,
      setWidgetOpen,
      toggleWidget,
    }),
    [
      activeSessionId,
      messages,
      loadingMessages,
      sending,
      approvingEscalationId,
      error,
      lastToolResults,
      widgetOpen,
      loadingBootstrap,
      setActiveSessionId,
      ensureSession,
      createSession,
      loadMessages,
      sendMessage,
      approveEscalation,
      cancelEscalation,
      toggleWidget,
    ]
  );

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAiChatContext() {
  const ctx = useContext(AiChatContext);
  if (!ctx) throw new Error("useAiChatContext must be used within AiChatProvider");
  return ctx;
}
