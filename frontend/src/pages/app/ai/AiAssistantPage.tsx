import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type AiActionRunResponse,
  type AiAnomalyEventResponse,
  type AiForecastRunResponse,
  type AiKnowledgeDocumentResponse,
  type AiOpsOverviewResponse,
  type AiKnowledgeSourceReference,
  type AiQuickAction,
  type AiReportRunResponse,
} from "@/api/client";
import { AiChatThread } from "@/pages/app/ai/components/AiChatThread";
import { AiAutomationPanel } from "@/pages/app/ai/components/AiAutomationPanel";
import { AiAnomalyInsightsPanel } from "@/pages/app/ai/components/AiAnomalyInsightsPanel";
import { AiForecastRequestPanel } from "@/pages/app/ai/components/AiForecastRequestPanel";
import { AiForecastRunsPanel } from "@/pages/app/ai/components/AiForecastRunsPanel";
import { AiKnowledgeAskPanel } from "@/pages/app/ai/components/AiKnowledgeAskPanel";
import { AiPromptInput } from "@/pages/app/ai/components/AiPromptInput";
import { AiQuickActions } from "@/pages/app/ai/components/AiQuickActions";
import { AiReportRunsPanel } from "@/pages/app/ai/components/AiReportRunsPanel";
import { AiSessionList } from "@/pages/app/ai/components/AiSessionList";
import { AiStateNotice } from "@/pages/app/ai/components/AiStateNotice";
import { useAiChat } from "@/pages/app/ai/hooks/useAiChat";
import { useAiSessions } from "@/pages/app/ai/hooks/useAiSessions";

export function AiAssistantPage() {
  const formatAiError = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError) {
      if (err.status === 429) return `Rate limit reached. Please wait a few seconds and retry. ${err.requestId ? `(trace: ${err.requestId})` : ""}`.trim();
      if (err.status === 504) return `Request timed out. Try a smaller scope or retry. ${err.requestId ? `(trace: ${err.requestId})` : ""}`.trim();
      return `${err.message}${err.requestId ? ` (trace: ${err.requestId})` : ""}`;
    }
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };
  const {
    sessions,
    activeSessionId,
    loadingSessions,
    error: sessionsError,
    createSession,
    selectSession,
    setError: setSessionsError,
  } = useAiSessions();
  const {
    messages,
    loadingMessages,
    sending,
    error: chatError,
    sendMessage,
    setError: setChatError,
  } = useAiChat(activeSessionId);
  const [quickActions, setQuickActions] = useState<AiQuickAction[]>([]);
  const [quickActionsLoading, setQuickActionsLoading] = useState(true);
  const [reportRuns, setReportRuns] = useState<AiReportRunResponse[]>([]);
  const [reportRunsLoading, setReportRunsLoading] = useState(true);
  const [forecastRuns, setForecastRuns] = useState<AiForecastRunResponse[]>([]);
  const [forecastRunsLoading, setForecastRunsLoading] = useState(true);
  const [knowledgeDocs, setKnowledgeDocs] = useState<AiKnowledgeDocumentResponse[]>([]);
  const [knowledgeDocsLoading, setKnowledgeDocsLoading] = useState(true);
  const [actionRuns, setActionRuns] = useState<AiActionRunResponse[]>([]);
  const [actionRunsLoading, setActionRunsLoading] = useState(true);
  const [anomalyEvents, setAnomalyEvents] = useState<AiAnomalyEventResponse[]>([]);
  const [anomalyEventsLoading, setAnomalyEventsLoading] = useState(true);
  const [anomalyRunning, setAnomalyRunning] = useState(false);
  const [opsOverview, setOpsOverview] = useState<AiOpsOverviewResponse | null>(null);

  useEffect(() => {
    const loadQuickActions = async () => {
      setQuickActionsLoading(true);
      try {
        const data = await api.aiQuickActions();
        setQuickActions(data.items || []);
      } catch {
        setQuickActions([]);
      } finally {
        setQuickActionsLoading(false);
      }
    };
    void loadQuickActions();
  }, []);

  useEffect(() => {
    const loadReports = async () => {
      setReportRunsLoading(true);
      try {
        const rows = await api.aiListReportRuns({ limit: 12 });
        setReportRuns(rows);
      } catch {
        setReportRuns([]);
      } finally {
        setReportRunsLoading(false);
      }
    };
    void loadReports();
  }, []);

  useEffect(() => {
    const loadForecasts = async () => {
      setForecastRunsLoading(true);
      try {
        const rows = await api.aiListForecastRuns({ limit: 12 });
        setForecastRuns(rows);
      } catch {
        setForecastRuns([]);
      } finally {
        setForecastRunsLoading(false);
      }
    };
    void loadForecasts();
  }, []);

  useEffect(() => {
    const loadKnowledgeDocs = async () => {
      setKnowledgeDocsLoading(true);
      try {
        const rows = await api.aiListKnowledgeDocuments({ limit: 20 });
        setKnowledgeDocs(rows);
      } catch {
        setKnowledgeDocs([]);
      } finally {
        setKnowledgeDocsLoading(false);
      }
    };
    void loadKnowledgeDocs();
  }, []);

  useEffect(() => {
    const loadActionRuns = async () => {
      setActionRunsLoading(true);
      try {
        const rows = await api.aiListActionRuns({ limit: 20 });
        setActionRuns(rows);
      } catch {
        setActionRuns([]);
      } finally {
        setActionRunsLoading(false);
      }
    };
    void loadActionRuns();
  }, []);

  useEffect(() => {
    const loadAnomalies = async () => {
      setAnomalyEventsLoading(true);
      try {
        const rows = await api.aiListAnomalyEvents({ limit: 30 });
        setAnomalyEvents(rows);
      } catch {
        setAnomalyEvents([]);
      } finally {
        setAnomalyEventsLoading(false);
      }
    };
    void loadAnomalies();
  }, []);

  useEffect(() => {
    const loadOpsOverview = async () => {
      try {
        const payload = await api.aiOpsOverview({ period_hours: 24 });
        setOpsOverview(payload);
      } catch {
        setOpsOverview(null);
      }
    };
    void loadOpsOverview();
  }, []);

  const ensureSession = async (): Promise<number | null> => {
    if (activeSessionId) return activeSessionId;
    return await createSession();
  };

  const runPrompt = async (prompt: string) => {
    setChatError("");
    setSessionsError("");
    const sessionId = await ensureSession();
    if (!sessionId) return;
    if (sessionId !== activeSessionId) {
      selectSession(sessionId);
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
    await sendMessage(prompt);
    try {
      const rows = await api.aiListReportRuns({ limit: 12 });
      setReportRuns(rows);
    } catch {
      // ignore report list refresh errors
    }
    try {
      const rows = await api.aiListForecastRuns({ limit: 12 });
      setForecastRuns(rows);
    } catch {
      // ignore forecast list refresh errors
    }
    try {
      const rows = await api.aiListActionRuns({ limit: 20 });
      setActionRuns(rows);
    } catch {
      // ignore action list refresh errors
    }
    try {
      const rows = await api.aiListAnomalyEvents({ limit: 30 });
      setAnomalyEvents(rows);
    } catch {
      // ignore anomaly list refresh errors
    }
  };

  const runForecast = async (input: { prompt: string; horizonDays: number; fromDate?: string; toDate?: string }) => {
    setChatError("");
    setSessionsError("");
    const sessionId = await ensureSession();
    if (!sessionId) return;
    try {
      await api.aiGenerateForecast({
        prompt: input.prompt,
        session_id: sessionId,
        horizon_days: input.horizonDays,
        from_date: input.fromDate ?? null,
        to_date: input.toDate ?? null,
      });
      const rows = await api.aiListForecastRuns({ limit: 12 });
      setForecastRuns(rows);
    } catch (err) {
      setChatError(formatAiError(err, "Failed to generate forecast"));
    }
  };

  const runKnowledgeAsk = async (
    query: string,
  ): Promise<{ answer: string; usedSources: AiKnowledgeSourceReference[]; disclaimer: string } | null> => {
    setChatError("");
    setSessionsError("");
    try {
      const res = await api.aiKnowledgeQuery({ query, top_k: 5 });
      return {
        answer: res.answer,
        usedSources: res.used_sources,
        disclaimer: res.disclaimer,
      };
    } catch (err) {
      setChatError(formatAiError(err, "Failed to query knowledge sources"));
      return null;
    }
  };

  const runActionPropose = async (prompt: string) => {
    setChatError("");
    setSessionsError("");
    const sessionId = await ensureSession();
    if (!sessionId) return;
    try {
      const created = await api.aiProposeAction({ prompt, session_id: sessionId });
      const rows = await api.aiListActionRuns({ limit: 20 });
      setActionRuns([created, ...rows.filter((x) => x.id !== created.id)]);
    } catch (err) {
      setChatError(formatAiError(err, "Failed to propose action"));
    }
  };

  const runActionConfirm = async (actionRunId: number, token: string) => {
    setChatError("");
    setSessionsError("");
    try {
      await api.aiConfirmAction(actionRunId, { confirmation_token: token });
      const rows = await api.aiListActionRuns({ limit: 20 });
      setActionRuns(rows);
    } catch (err) {
      setChatError(formatAiError(err, "Failed to confirm action"));
    }
  };

  const runAnomalyInsights = async () => {
    setChatError("");
    setSessionsError("");
    const sessionId = await ensureSession();
    setAnomalyRunning(true);
    try {
      await api.aiGenerateAnomalyInsights({ session_id: sessionId ?? null });
      const rows = await api.aiListAnomalyEvents({ limit: 30 });
      setAnomalyEvents(rows);
    } catch (err) {
      setChatError(formatAiError(err, "Failed to generate anomaly insights"));
    } finally {
      setAnomalyRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI Tool</h1>
        <p className="text-sm text-slate-500">
          Tenant-safe ERP assistant for summaries, reports, forecasts, knowledge retrieval, and controlled draft automation.
        </p>
      </div>

      {sessionsError ? <AiStateNotice type="error" message={sessionsError} /> : null}
      {chatError ? <AiStateNotice type="error" message={chatError} /> : null}
      {opsOverview ? (
        <AiStateNotice
          message={`AI ops (24h): success ${opsOverview.tool_success_rate.toFixed(1)}%, blocked ${opsOverview.blocked_events}, errors ${opsOverview.error_events}, avg ${opsOverview.avg_duration_ms}ms`}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <AiSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={loadingSessions}
          onSelect={selectSession}
          onCreate={() => {
            void createSession();
          }}
        />

        <div className="space-y-4">
          <AiChatThread messages={messages} loading={loadingMessages} />
          <AiPromptInput sending={sending} onSend={runPrompt} disabled={loadingSessions} />
        </div>

        <div>
          {quickActionsLoading ? (
            <AiStateNotice message="Loading quick actions..." />
          ) : (
            <div className="space-y-4">
              <AiQuickActions actions={quickActions} onRun={(prompt) => void runPrompt(prompt)} disabled={sending} />
              <AiAnomalyInsightsPanel
                loading={anomalyEventsLoading}
                running={anomalyRunning}
                events={anomalyEvents}
                onGenerate={runAnomalyInsights}
              />
              <AiAutomationPanel
                disabled={sending}
                runs={actionRuns}
                loading={actionRunsLoading}
                onPropose={runActionPropose}
                onConfirm={runActionConfirm}
              />
              <AiKnowledgeAskPanel
                disabled={sending}
                documents={knowledgeDocs}
                loadingDocuments={knowledgeDocsLoading}
                onAsk={runKnowledgeAsk}
              />
              <AiForecastRequestPanel onGenerate={runForecast} disabled={sending} />
              <AiReportRunsPanel reports={reportRuns} loading={reportRunsLoading} />
              <AiForecastRunsPanel runs={forecastRuns} loading={forecastRunsLoading} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
