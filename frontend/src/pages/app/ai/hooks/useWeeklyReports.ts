import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AiWeeklyReportItem, type AiWeeklyReportStatus } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useWeeklyReports(initialLimit = 24) {
  const [items, setItems] = useState<AiWeeklyReportItem[]>([]);
  const [status, setStatus] = useState<AiWeeklyReportStatus | null>(null);
  const [limit, setLimit] = useState(initialLimit);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [listRes, st] = await Promise.all([api.aiListWeeklyReports({ limit }), api.aiGetWeeklyReportsStatus()]);
      setItems(listRes.items);
      setStatus(st);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      logApiError("useWeeklyReports.load", e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
  }, [items, selectedId]);

  const selected = useMemo(
    () => (selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null),
    [items, selectedId],
  );

  const generate = useCallback(
    async (opts?: { force?: boolean }) => {
      setInfo(null);
      setError(null);
      if (opts?.force) {
        const ok = window.confirm("Regenerate this week’s report? The narrative will be replaced with a fresh AI draft.");
        if (!ok) return;
      }
      setGenerating(true);
      try {
        const r = await api.aiGenerateWeeklyReport({ force: opts?.force ?? false });
        if (r.status === "skipped_no_gemini") {
          setError("Cannot generate: Gemini is not configured on the server.");
        } else if (r.status === "skipped_empty") {
          setError("Generation returned empty text from the model. Try again later.");
        } else if (r.status === "exists") {
          setInfo("This week’s report already exists. Use “Regenerate” to replace it.");
        } else if (r.status === "created") {
          setInfo("New report created for the current week.");
        } else if (r.status === "updated") {
          setInfo("Report updated.");
        }
        await load();
        if (r.report?.id) {
          setSelectedId(r.report.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        logApiError("useWeeklyReports.generate", e);
      } finally {
        setGenerating(false);
      }
    },
    [load],
  );

  return {
    items,
    status,
    selected,
    selectedId,
    setSelectedId,
    limit,
    setLimit,
    loading,
    generating,
    error,
    info,
    setInfo,
    load,
    generate,
  };
}
