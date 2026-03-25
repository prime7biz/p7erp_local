import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import type { PipelineOrderRow, PipelineStyleGroup } from "@/types/productionPlanning";

export type PipelineViewMode = "order" | "style";

export function useProductionPipeline(view: PipelineViewMode) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderRows, setOrderRows] = useState<PipelineOrderRow[]>([]);
  const [styleGroups, setStyleGroups] = useState<PipelineStyleGroup[]>([]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = (await api.getProductionPipeline({
        group_by: view === "style" ? "style" : undefined,
      })) as {
        group_by?: string;
        items?: PipelineOrderRow[];
        styles?: PipelineStyleGroup[];
      };
      if (view === "style" && res.styles) {
        setStyleGroups(res.styles);
        setOrderRows([]);
      } else if (res.items) {
        setOrderRows(res.items);
        setStyleGroups([]);
      } else {
        setOrderRows([]);
        setStyleGroups([]);
      }
    } catch (e) {
      logApiError(e, "useProductionPipeline.load");
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, orderRows, styleGroups, reload: load };
}
