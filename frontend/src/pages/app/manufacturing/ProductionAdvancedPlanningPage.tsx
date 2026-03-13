import { useState } from "react";

import { api } from "@/api/client";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductionAdvancedPlanningPage() {
  const [planId, setPlanId] = useState<number | null>(null);
  const [horizonStart, setHorizonStart] = useState(todayIso());
  const [horizonEnd, setHorizonEnd] = useState(todayIso());
  const [run, setRun] = useState<Awaited<ReturnType<typeof api.runMfgMrp>> | null>(null);
  const [recommendations, setRecommendations] = useState<Awaited<ReturnType<typeof api.getMfgMrpRecommendations>>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const executeRun = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const created = await api.runMfgMrp({
        plan_id: planId ?? undefined,
        horizon_start: horizonStart,
        horizon_end: horizonEnd,
      });
      setRun(created);
      const recs = await api.getMfgMrpRecommendations(created.id);
      setRecommendations(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run MRP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Advanced Planning (MRP)</h1>
        <p className="text-sm text-slate-500">Run MRP and review suggested manufacturing quantities by item.</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={executeRun}>
          <input className="rounded border px-3 py-2 text-sm" type="number" min={1} placeholder="Optional Plan ID" value={planId ?? ""} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : null)} />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={horizonStart} onChange={(e) => setHorizonStart(e.target.value)} />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={horizonEnd} onChange={(e) => setHorizonEnd(e.target.value)} />
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? "Running..." : "Run MRP"}</button>
        </form>
      </div>

      {run ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div><span className="text-slate-500">Run Code:</span> <span className="font-semibold">{run.run_code}</span></div>
          <div><span className="text-slate-500">Horizon:</span> {run.horizon_start} to {run.horizon_end}</div>
          <div><span className="text-slate-500">Status:</span> {run.status}</div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-4 py-2">Item ID</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Suggested Qty</th><th className="px-4 py-2">Due Date</th><th className="px-4 py-2">Reason</th></tr>
          </thead>
          <tbody>
            {recommendations.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">{row.item_id}</td>
                <td className="px-4 py-2">{row.recommendation_type}</td>
                <td className="px-4 py-2">{row.suggested_qty.toFixed(3)}</td>
                <td className="px-4 py-2">{row.due_date ?? "-"}</td>
                <td className="px-4 py-2">{row.reason ?? "-"}</td>
              </tr>
            ))}
            {recommendations.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={5}>No recommendations yet. Run MRP first.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
