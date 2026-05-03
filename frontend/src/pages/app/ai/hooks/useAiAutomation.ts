import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type AiActionRunResponse,
  type AiAutomationRuleRow,
  type AiDataQualityScanResponse,
  type AiGovernanceProposal,
} from "@/api/client";
import { useAiSessions } from "@/pages/app/ai/hooks/useAiSessions";
import { logApiError } from "@/utils/logApiError";

export type GovernanceStatusFilter = "proposed" | "approved" | "rejected" | "rolled_back" | "all";

function formatErr(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const trace = err.requestId ? ` (trace: ${err.requestId})` : "";
    if (err.status === 429) return `Rate limit reached. Retry shortly.${trace}`;
    if (err.status === 504) return `Request timed out. Retry shortly.${trace}`;
    return `${err.message}${trace}`;
  }
  return err instanceof Error ? err.message : fallback;
}

export function useAiAutomation(opts: { governanceEnabled: boolean }) {
  const sessions = useAiSessions();

  const [scan, setScan] = useState<AiDataQualityScanResponse | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  const [runs, setRuns] = useState<AiActionRunResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [freshRun, setFreshRun] = useState<AiActionRunResponse | null>(null);

  const [rules, setRules] = useState<AiAutomationRuleRow[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  const [proposals, setProposals] = useState<AiGovernanceProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsStatus, setProposalsStatus] = useState<GovernanceStatusFilter>("proposed");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const refreshRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      setRuns(await api.aiListActionRuns({ limit: 50 }));
    } catch (e) {
      logApiError("useAiAutomation.refreshRuns", e);
      setError(formatErr(e, "Failed to load action runs"));
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setError("");
    try {
      setScan(await api.aiDataQualityScan());
    } catch (e) {
      logApiError("useAiAutomation.runScan", e);
      setError(formatErr(e, "Failed to run data quality scan"));
    } finally {
      setScanLoading(false);
    }
  }, []);

  const propose = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;
      setError("");
      setInfo("");
      const sid = sessions.activeSessionId ?? (await sessions.createSession());
      if (!sid) {
        setError("Could not create AI session");
        return;
      }
      try {
        const created = await api.aiProposeAction({ prompt: prompt.trim(), session_id: sid });
        setFreshRun(created);
        const list = await api.aiListActionRuns({ limit: 50 });
        setRuns(list);
        setInfo("Action proposed. Copy the confirmation token and confirm to execute.");
      } catch (e) {
        logApiError("useAiAutomation.propose", e);
        setError(formatErr(e, "Failed to propose action"));
      }
    },
    [sessions],
  );

  const confirm = useCallback(async (actionRunId: number, token: string) => {
    if (!token.trim()) return;
    setError("");
    setInfo("");
    try {
      await api.aiConfirmAction(actionRunId, { confirmation_token: token.trim() });
      setFreshRun(null);
      setRuns(await api.aiListActionRuns({ limit: 50 }));
      setInfo("Action confirmed.");
    } catch (e) {
      logApiError("useAiAutomation.confirm", e);
      setError(formatErr(e, "Failed to confirm action"));
    }
  }, []);

  const refreshRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      setRules(await api.aiListAutomationRules());
    } catch (e) {
      logApiError("useAiAutomation.refreshRules", e);
      setError(formatErr(e, "Failed to load rules"));
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const refreshProposals = useCallback(
    async (statusFilter?: GovernanceStatusFilter) => {
      if (!opts.governanceEnabled) return;
      const s = statusFilter ?? proposalsStatus;
      if (statusFilter != null) {
        setProposalsStatus(statusFilter);
      }
      setProposalsLoading(true);
      try {
        setProposals(await api.getErpAiGovernanceProposals({ status_filter: s, limit: 100 }));
      } catch (e) {
        logApiError("useAiAutomation.refreshProposals", e);
        setError(formatErr(e, "Failed to load proposals"));
      } finally {
        setProposalsLoading(false);
      }
    },
    [opts.governanceEnabled, proposalsStatus],
  );

  const approveProposal = useCallback(
    async (id: number) => {
      setError("");
      setInfo("");
      try {
        await api.postErpAiGovernanceApprove(id);
        setInfo(`Proposal ${id} approved.`);
        await refreshProposals();
      } catch (e) {
        logApiError("useAiAutomation.approveProposal", e);
        setError(formatErr(e, "Failed to approve proposal"));
      }
    },
    [refreshProposals],
  );

  const rejectProposal = useCallback(
    async (id: number, reason: string) => {
      setError("");
      setInfo("");
      try {
        await api.postErpAiGovernanceReject(id, { reason: reason || null });
        setInfo(`Proposal ${id} rejected.`);
        await refreshProposals();
      } catch (e) {
        logApiError("useAiAutomation.rejectProposal", e);
        setError(formatErr(e, "Failed to reject proposal"));
      }
    },
    [refreshProposals],
  );

  const rollbackProposal = useCallback(
    async (id: number) => {
      setError("");
      setInfo("");
      try {
        await api.postErpAiGovernanceRollback(id);
        setInfo(`Proposal ${id} marked for rollback.`);
        await refreshProposals();
      } catch (e) {
        logApiError("useAiAutomation.rollbackProposal", e);
        setError(formatErr(e, "Failed to roll back proposal"));
      }
    },
    [refreshProposals],
  );

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  useEffect(() => {
    void refreshRules();
  }, [refreshRules]);

  useEffect(() => {
    if (!opts.governanceEnabled) {
      setProposals([]);
      setProposalsStatus("proposed");
      return;
    }
    let cancelled = false;
    setProposalsLoading(true);
    setProposalsStatus("proposed");
    void api
      .getErpAiGovernanceProposals({ status_filter: "proposed", limit: 100 })
      .then((rows) => {
        if (!cancelled) setProposals(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          logApiError("useAiAutomation.initialProposals", e);
          setError(formatErr(e, "Failed to load proposals"));
        }
      })
      .finally(() => {
        if (!cancelled) setProposalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opts.governanceEnabled]);

  return {
    sessions,
    scan,
    scanLoading,
    runScan,
    runs,
    runsLoading,
    refreshRuns,
    freshRun,
    propose,
    confirm,
    rules,
    rulesLoading,
    proposals,
    proposalsLoading,
    proposalsStatus,
    refreshProposals,
    approveProposal,
    rejectProposal,
    rollbackProposal,
    error,
    info,
    setError,
    setInfo,
  };
}
