import { useCallback, useEffect, useState } from "react";
import { api, type AiSessionResponse } from "@/api/client";

const LAST_SESSION_KEY = "p7_ai_last_session_id";

export function useAiSessions() {
  const [sessions, setSessions] = useState<AiSessionResponse[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState("");

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError("");
    try {
      const rows = await api.aiListSessions({ limit: 50, offset: 0 });
      setSessions(rows);
      const saved = Number(localStorage.getItem(LAST_SESSION_KEY) || "0");
      if (saved && rows.some((x) => x.id === saved)) {
        setActiveSessionId(saved);
      } else if (rows[0]) {
        setActiveSessionId(rows[0].id);
      } else {
        setActiveSessionId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const createSession = useCallback(async () => {
    setError("");
    try {
      const session = await api.aiCreateSession({ title: "New AI Session" });
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      localStorage.setItem(LAST_SESSION_KEY, String(session.id));
      return session.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create AI session";
      setError(msg);
      return null;
    }
  }, []);

  const selectSession = useCallback((sessionId: number) => {
    setActiveSessionId(sessionId);
    localStorage.setItem(LAST_SESSION_KEY, String(sessionId));
  }, []);

  return {
    sessions,
    activeSessionId,
    loadingSessions,
    error,
    loadSessions,
    createSession,
    selectSession,
    setError,
  };
}
