/** HR → Manpower → Ratios: actual vs tenant targets. */
import { useCallback, useEffect, useState } from "react";
import { request } from "@/api/core";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

type RatioRow = {
  name: string;
  actual: string | null;
  target: string | null;
  parts: number[];
};

type RatiosPayload = {
  headcount: number;
  by_category: Record<string, number>;
  by_department_group: Record<string, number>;
  ratios: RatioRow[];
  data_quality: {
    unclassified_employees: number;
    warning: string | null;
    unassigned_department_group: number;
  };
};

export function HrManpowerRatiosPage() {
  const [data, setData] = useState<RatiosPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await request<RatiosPayload>("/api/v1/hr/manpower/ratios");
      setData(d);
    } catch (e) {
      logApiError("HrManpowerRatiosPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load ratios.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Ratios"
        description="Actual manpower ratios versus targets from Settings (targets are advisory only)."
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {data?.data_quality.warning ? (
        <p className="text-sm text-amber-700">{data.data_quality.warning}</p>
      ) : null}
      {data ? (
        <p className="text-sm text-text-secondary">Active headcount: {data.headcount}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Ratio</th>
              <th className="py-2 pr-3">Actual</th>
              <th className="py-2 pr-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {data?.ratios.map((r) => (
              <tr key={r.name} className="border-b border-border/60">
                <td className="py-1.5 pr-3">{r.name}</td>
                <td className="py-1.5 pr-3">{r.actual ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.target ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerRatiosPage;
