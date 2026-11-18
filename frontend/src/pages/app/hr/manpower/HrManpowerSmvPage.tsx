/** HR → Manpower → SMV: industry vs factory SMV. */
import { useCallback, useEffect, useState } from "react";
import { request } from "@/api/core";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

type SmvRow = {
  style_id: number;
  style_code: string;
  style_name: string;
  industry_smv: string | null;
  industry_source: string;
  factory_smv: string | null;
  factory_reason: string | null;
  variance: string | null;
};

type SmvPayload = {
  as_of: string;
  lookback_days: number;
  rows: SmvRow[];
  notes: string[];
};

export function HrManpowerSmvPage() {
  const [data, setData] = useState<SmvPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await request<SmvPayload>("/api/v1/hr/manpower/smv-comparison");
      setData(d);
    } catch (e) {
      logApiError("HrManpowerSmvPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load SMV comparison.");
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
        title="SMV comparison"
        description="Industry (style standard / OB) versus factory advisory SMV from sewing output."
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {data?.notes?.length ? (
        <ul className="list-disc pl-5 text-xs text-text-secondary">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Style</th>
              <th className="py-2 pr-3">Industry SMV</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Factory SMV</th>
              <th className="py-2 pr-3">Variance</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.style_id} className="border-b border-border/60">
                <td className="py-1.5 pr-3">
                  {r.style_code} — {r.style_name}
                </td>
                <td className="py-1.5 pr-3">{r.industry_smv ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.industry_source}</td>
                <td className="py-1.5 pr-3">
                  {r.factory_smv ?? "—"}
                  {r.factory_reason ? (
                    <div className="text-xs text-text-secondary">{r.factory_reason}</div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3">{r.variance ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerSmvPage;
